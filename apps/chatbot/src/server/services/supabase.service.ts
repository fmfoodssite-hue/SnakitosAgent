import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { config } from "../config";
import { MessageRole } from "../types/chat.types";

export const supabaseClient: SupabaseClient = createClient(
  config.supabase.url || "https://invalid.local",
  config.supabase.serviceRoleKey || "missing-service-role-key",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

export class SupabaseService {
  public readonly client = supabaseClient;

  private estimateTokens(input: string): number {
    return Math.max(1, Math.ceil((input || "").length / 4));
  }

  private estimateCost(inputTokens: number, outputTokens: number): number {
    return Number(
      (((inputTokens / 1_000_000) * 0.4) + ((outputTokens / 1_000_000) * 1.6)).toFixed(6),
    );
  }

  private async getAdminSessionInternalId(chatId: string) {
    const { data } = await this.client
      .from("chat_sessions")
      .select("id")
      .eq("session_id", chatId)
      .maybeSingle();

    return data?.id ? String(data.id) : null;
  }

  async ensureAdminChatSession(userId: string, chatId: string): Promise<string | null> {
    if (!userId || !chatId) {
      return null;
    }

    const existingId = await this.getAdminSessionInternalId(chatId);
    if (existingId) {
      await this.client
        .from("chat_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", existingId);
      return existingId;
    }

    const { data } = await this.client
      .from("chat_sessions")
      .insert({
        session_id: chatId,
        user_identifier: userId,
        handoff_status: "none",
      })
      .select("id")
      .maybeSingle();

    return data?.id ? String(data.id) : null;
  }

  async addAdminChatMessage(chatId: string, role: MessageRole, content: string): Promise<void> {
    const sessionId = await this.getAdminSessionInternalId(chatId);
    if (!sessionId) {
      return;
    }

    if (role === "user") {
      await this.client.from("chat_messages").insert({
        session_id: sessionId,
        user_message: content,
        metadata: {},
      });
      return;
    }

    const { data: pendingUserMessage } = await this.client
      .from("chat_messages")
      .select("id, metadata")
      .eq("session_id", sessionId)
      .is("ai_response", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingUserMessage?.id) {
      await this.client
        .from("chat_messages")
        .update({
          ai_response: content,
          metadata: pendingUserMessage.metadata ?? {},
        })
        .eq("id", pendingUserMessage.id);
      return;
    }

    await this.client.from("chat_messages").insert({
      session_id: sessionId,
      user_message: "",
      ai_response: content,
      metadata: {},
    });
  }

  async mirrorChatProcessed(metadata: Record<string, unknown>): Promise<void> {
    const chatId = typeof metadata.chatId === "string" ? metadata.chatId : "";
    const userId = typeof metadata.userId === "string" ? metadata.userId : "";
    const userMessage = typeof metadata.userMessage === "string" ? metadata.userMessage : "";
    const response = typeof metadata.response === "string" ? metadata.response : "";
    const intent = typeof metadata.intent === "string" ? metadata.intent : "general";
    const responseTimeMs =
      typeof metadata.responseTimeMs === "number" ? metadata.responseTimeMs : 0;
    const retrievedContext = Array.isArray(metadata.retrievedContext)
      ? metadata.retrievedContext
      : [];
    const sourceLabel =
      typeof metadata.sourceLabel === "string" ? metadata.sourceLabel : "General support";

    const sessionId =
      (await this.ensureAdminChatSession(userId, chatId)) ??
      (await this.getAdminSessionInternalId(chatId));
    if (!sessionId) {
      return;
    }

    const inputTokens = this.estimateTokens(userMessage);
    const outputTokens = this.estimateTokens(response);
    const totalTokens = inputTokens + outputTokens;
    const estimatedCost = this.estimateCost(inputTokens, outputTokens);
    const hadSource = retrievedContext.length > 0;

    const { data: latestMessage } = await this.client
      .from("chat_messages")
      .select("id, metadata")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestMessage?.id) {
      const mergedMetadata = {
        ...((latestMessage.metadata as Record<string, unknown> | null) ?? {}),
        responseTimeMs,
        sourceLabel,
        tokenUsage: totalTokens,
        totalTokens,
        inputTokens,
        outputTokens,
        estimatedCost,
        retrievedContext,
      };

      await this.client
        .from("chat_messages")
        .update({
          detected_intent: intent,
          retrieved_sources: retrievedContext,
          is_failed_answer: !hadSource && intent === "general",
          metadata: mergedMetadata,
        })
        .eq("id", latestMessage.id);

      try {
        await this.client.from("model_usage_logs").insert({
          model: config.app.openAiModel,
          endpoint: "chat",
          status: "success",
          latency_ms: responseTimeMs,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          estimated_cost: estimatedCost,
        });
      } catch {
        // Ignore when the admin telemetry table is not present yet.
      }

      let answerTraceInsert: { data: { id?: string } | null } = { data: null };
      try {
        const result = await this.client
          .from("answer_traces")
          .insert({
            conversation_id: sessionId,
            user_question: userMessage,
            bot_answer: response,
            model: config.app.openAiModel,
            confidence_score: hadSource ? 0.8 : 0.35,
            retrieval_confidence: hadSource ? 0.75 : 0.05,
            grounding_score: hadSource ? 0.8 : 0.05,
            hallucination_risk: hadSource ? 0.2 : 0.9,
            had_source: hadSource,
            used_stale_source: false,
            latency_ms: responseTimeMs,
            retrieval_latency_ms: 0,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: totalTokens,
            estimated_cost: estimatedCost,
            reviewed_status: "unreviewed",
          })
          .select("id")
          .maybeSingle();
        answerTraceInsert = { data: result.data ? { id: String(result.data.id) } : null };
      } catch {
        // Ignore when the trace table is not present yet.
      }

      const answerTraceId = answerTraceInsert?.data?.id
        ? String(answerTraceInsert.data.id)
        : null;

      try {
        await this.client.from("token_usage_logs").insert({
          conversation_id: sessionId,
          answer_trace_id: answerTraceId,
          model: config.app.openAiModel,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          embedding_tokens: 0,
          total_tokens: totalTokens,
          estimated_cost: estimatedCost,
        });
      } catch {
        // Ignore when the usage table is not present yet.
      }

      if (!hadSource) {
        try {
          await this.client.from("failed_answers").insert({
            answer_trace_id: answerTraceId,
            conversation_id: sessionId,
            user_question: userMessage,
            bot_answer: response,
            root_cause: "missing_source",
            severity: "medium",
            status: "open",
            recommended_fix: "Add or improve trusted knowledge for this query.",
            before_confidence: 0.35,
          });
        } catch {
          // Ignore when the failed answer table is not present yet.
        }
      }
    }
  }

  async upsertUser(input: {
    id?: string;
    email?: string;
    phone?: string;
  }): Promise<string> {
    const id = input.id || randomUUID();

    await this.client.from("users").upsert(
      {
        id,
        email: input.email ?? null,
        phone: input.phone ?? null,
      },
      {
        onConflict: "id",
      },
    );

    return id;
  }

  async getOrCreateChat(userId: string, chatId?: string): Promise<string> {
    if (chatId && (await this.chatBelongsToUser(userId, chatId))) {
      return chatId;
    }

    const newChatId = randomUUID();
    await this.client.from("chats").insert({
      id: newChatId,
      user_id: userId,
    });
    return newChatId;
  }

  async chatBelongsToUser(userId: string, chatId: string): Promise<boolean> {
    if (!userId || !chatId) {
      return false;
    }

    const { data, error } = await this.client
      .from("chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", userId)
      .maybeSingle();

    return !error && Boolean(data?.id);
  }

  async ensureChat(userId: string, chatId: string): Promise<void> {
    if (!userId || !chatId) {
      return;
    }

    await this.client.from("chats").upsert(
      {
        id: chatId,
        user_id: userId,
      },
      {
        onConflict: "id",
      },
    );

    await this.ensureAdminChatSession(userId, chatId).catch(() => undefined);
  }

  async addMessage(chatId: string, role: MessageRole, content: string): Promise<void> {
    await this.client.from("messages").insert({
      id: randomUUID(),
      chat_id: chatId,
      role,
      content,
    });

    await this.addAdminChatMessage(chatId, role, content).catch(() => undefined);
  }

  async getRecentMessages(
    chatId: string,
    limit = 6,
  ): Promise<Array<{ role: MessageRole; content: string }>> {
    const { data, error } = await this.client
      .from("messages")
      .select("role, content, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) {
      return [];
    }

    return data
      .reverse()
      .map((item) => ({ role: item.role as MessageRole, content: item.content as string }));
  }

  async getRecentMessagesForUser(
    userId: string,
    limit = 12,
  ): Promise<Array<{ role: MessageRole; content: string }>> {
    const { data, error } = await this.client
      .from("messages")
      .select("role, content, created_at, chats!inner(user_id)")
      .eq("chats.user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) {
      return [];
    }

    return data
      .reverse()
      .map((item) => ({ role: item.role as MessageRole, content: item.content as string }));
  }

  async logEvent(event: string, metadata: Record<string, unknown>): Promise<void> {
    await this.client.from("logs").insert({
      id: randomUUID(),
      event,
      metadata,
    });

    if (event === "chat_processed") {
      await this.mirrorChatProcessed(metadata).catch(() => undefined);
    }
  }

  async getRecentLogs(limit = 50): Promise<Array<Record<string, unknown>>> {
    const { data } = await this.client
      .from("logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    return (data ?? []) as Array<Record<string, unknown>>;
  }
}

export const supabaseService = new SupabaseService();
