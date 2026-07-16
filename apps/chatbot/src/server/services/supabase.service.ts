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

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function toStableUuid(value: string): string {
  if (isValidUuid(value)) return value;
  const padded = value.replace(/-/g, "").padEnd(32, "0").slice(0, 32);
  return `${padded.slice(0, 8)}-${padded.slice(8, 12)}-4${padded.slice(13, 16)}-a${padded.slice(17, 20)}-${padded.slice(20, 32)}`;
}

export class SupabaseService {
  public readonly client = supabaseClient;

  private isConfigured(): boolean {
    return Boolean(config.supabase.url && config.supabase.serviceRoleKey);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error("Supabase server configuration is missing.");
    }
  }

  private estimateTokens(input: string): number {
    return Math.max(1, Math.ceil((input || "").length / 4));
  }

  private estimateCost(inputTokens: number, outputTokens: number): number {
    return Number(
      (((inputTokens / 1_000_000) * 0.4) + ((outputTokens / 1_000_000) * 1.6)).toFixed(6),
    );
  }

  private async getAdminSessionInternalId(chatId: string): Promise<string | null> {
    this.assertConfigured();
    if (!chatId) return null;

    if (isValidUuid(chatId)) {
      const { data } = await this.client
        .from("chat_sessions")
        .select("id")
        .eq("id", chatId)
        .maybeSingle();
      if (data?.id) return String(data.id);
    }

    const { data: sessionData } = await this.client
      .from("chat_sessions")
      .select("id")
      .eq("session_id", chatId)
      .maybeSingle();
    if (sessionData?.id) return String(sessionData.id);

    const { data } = await this.client
      .from("chat_sessions")
      .select("id")
      .eq("user_identifier", chatId)
      .maybeSingle();

    return data?.id ? String(data.id) : null;
  }

  async ensureAdminChatSession(userId: string, chatId: string): Promise<string | null> {
    this.assertConfigured();
    if (!chatId) return null;

    const existingId = await this.getAdminSessionInternalId(chatId);
    if (existingId) {
      await this.client
        .from("chat_sessions")
        .update({
          handoff_status: "none",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingId);
      return existingId;
    }

    const { data, error } = await this.client
      .from("chat_sessions")
      .insert({
        session_id: chatId,
        user_id: userId ? toStableUuid(userId) : null,
        user_identifier: userId || null,
        source: "chatbot",
        handoff_status: "none",
        metadata: {
          chatId,
          userId,
          source: "chatbot",
        },
      })
      .select("id")
      .maybeSingle();

    if (error) {
      return this.getAdminSessionInternalId(chatId);
    }

    return data?.id ? String(data.id) : null;
  }

  async addAdminChatMessage(chatId: string, role: MessageRole, content: string): Promise<void> {
    this.assertConfigured();
    const sessionId = await this.getAdminSessionInternalId(chatId);
    if (!sessionId) return;

    const now = new Date().toISOString();

    if (role === "user") {
      const { error } = await this.client.from("chat_messages").insert({
        session_id: sessionId,
        user_message: content,
        user_query: content,
        detected_intent: "general",
        intent: "general",
        status: "success",
        confidence_score: 0.75,
        response_time_ms: 0,
        retrieved_context: [],
        retrieved_sources: [],
        recommended_products: [],
        is_failed_answer: false,
        metadata: {
          role: "user",
          source: "chatbot",
        },
        created_at: now,
      });
      if (error) throw error;
      return;
    }

    const { data: pendingMsg, error: pendingError } = await this.client
      .from("chat_messages")
      .select("id, metadata")
      .eq("session_id", sessionId)
      .is("ai_response", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingError) throw pendingError;

    if (pendingMsg?.id) {
      const { error } = await this.client
        .from("chat_messages")
        .update({
          ai_response: content,
          metadata: {
            ...((pendingMsg.metadata as Record<string, unknown> | null) ?? {}),
            responseRole: "bot",
          },
        })
        .eq("id", pendingMsg.id);
      if (error) throw error;
      return;
    }

    const { error } = await this.client.from("chat_messages").insert({
      session_id: sessionId,
      user_message: "",
      user_query: "",
      ai_response: content,
      detected_intent: "general",
      intent: "general",
      status: "success",
      confidence_score: 0.75,
      response_time_ms: 0,
      retrieved_context: [],
      retrieved_sources: [],
      recommended_products: [],
      metadata: {
        role: "bot",
        source: "chatbot",
      },
      created_at: now,
    });
    if (error) throw error;
  }

  async mirrorChatProcessed(metadata: Record<string, unknown>): Promise<void> {
    this.assertConfigured();

    const chatId = typeof metadata.chatId === "string" ? metadata.chatId : "";
    const userId = typeof metadata.userId === "string" ? metadata.userId : "";
    const userMessage = typeof metadata.userMessage === "string" ? metadata.userMessage : "";
    const response = typeof metadata.response === "string" ? metadata.response : "";
    const intent = typeof metadata.intent === "string" ? metadata.intent : "general";
    const responseTimeMs = typeof metadata.responseTimeMs === "number" ? metadata.responseTimeMs : 0;
    const retrievedContext = Array.isArray(metadata.retrievedContext) ? metadata.retrievedContext : [];
    const sourceLabel = typeof metadata.sourceLabel === "string" ? metadata.sourceLabel : "General support";

    const hadSource = retrievedContext.length > 0;
    const confidenceScore =
      typeof metadata.confidenceScore === "number" ? metadata.confidenceScore : hadSource ? 0.72 : 0.28;
    const retrievalConfidence =
      typeof metadata.retrievalConfidence === "number" ? metadata.retrievalConfidence : hadSource ? 0.68 : 0.05;
    const groundingScore =
      typeof metadata.groundingScore === "number" ? metadata.groundingScore : hadSource ? 0.7 : 0.05;
    const hallucinationRisk =
      typeof metadata.hallucinationRisk === "number" ? metadata.hallucinationRisk : hadSource ? 0.25 : 0.88;
    const retrievalLatencyMs =
      typeof metadata.retrievalLatencyMs === "number" ? metadata.retrievalLatencyMs : 0;
    const guardrailTriggered =
      typeof metadata.guardrailTriggered === "boolean" ? metadata.guardrailTriggered : false;
    const guardrailType = typeof metadata.guardrailType === "string" ? metadata.guardrailType : null;

    if (userId) {
      await this.upsertUser({ id: userId });
    }

    const sessionId =
      (await this.ensureAdminChatSession(userId, chatId)) ?? (await this.getAdminSessionInternalId(chatId));
    if (!sessionId) return;

    const inputTokens = this.estimateTokens(userMessage);
    const outputTokens = this.estimateTokens(response);
    const totalTokens = inputTokens + outputTokens;
    const estimatedCost = this.estimateCost(inputTokens, outputTokens);

    const { data: latestMessage, error: latestError } = await this.client
      .from("chat_messages")
      .select("id, metadata")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) throw latestError;

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

      const { error } = await this.client
        .from("chat_messages")
        .update({
          detected_intent: intent,
          intent: intent === "product" || intent === "order" ? intent : "general",
          retrieved_context: retrievedContext,
          retrieved_sources: retrievedContext,
          is_failed_answer: !hadSource && intent === "general",
          confidence_score: confidenceScore,
          response_time_ms: responseTimeMs,
          metadata: mergedMetadata,
        })
        .eq("id", latestMessage.id);
      if (error) throw error;
    }

    let answerTraceId: string | null = null;
    const { data: traceData, error: traceError } = await this.client
      .from("answer_traces")
      .insert({
        session_id: sessionId,
        chat_session_id: sessionId,
        message_id: latestMessage?.id ?? null,
        user_question: userMessage,
        bot_answer: response,
        model: config.app.openAiModel,
        confidence_score: confidenceScore,
        retrieval_confidence: retrievalConfidence,
        grounding_score: groundingScore,
        hallucination_risk: hallucinationRisk,
        had_source: hadSource,
        used_stale_source: false,
        latency_ms: responseTimeMs,
        retrieval_latency_ms: retrievalLatencyMs,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        estimated_cost: estimatedCost,
        reviewed_status: "unreviewed",
        retrieved_sources: retrievedContext,
        metadata: {
          sourceLabel,
        },
      })
      .select("id")
      .maybeSingle();

    if (traceError) throw traceError;
    answerTraceId = traceData?.id ? String(traceData.id) : null;

    const { error: tokenError } = await this.client.from("token_usage_logs").insert({
      session_id: sessionId,
      chat_session_id: sessionId,
      answer_trace_id: answerTraceId,
      model: config.app.openAiModel,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      embedding_tokens: 0,
      total_tokens: totalTokens,
      estimated_cost: estimatedCost,
      metadata: {
        source: "chatbot",
      },
    });

    if (tokenError) throw tokenError;

    if (!hadSource) {
      const { error } = await this.client.from("failed_answers").insert({
        session_id: sessionId,
        message_id: latestMessage?.id ?? null,
        answer_trace_id: answerTraceId,
        chat_session_id: sessionId,
        user_message: userMessage,
        ai_response: response,
        failure_reason: "missing_source",
        user_question: userMessage,
        bot_answer: response,
        root_cause: "missing_source",
        severity: "medium",
        status: "open",
        recommended_fix: "Add or improve trusted knowledge for this query.",
        before_confidence: confidenceScore,
        metadata: {
          sourceLabel,
        },
      });
      if (error) throw error;
    }

    if (guardrailTriggered && guardrailType) {
      const { error } = await this.client.from("guardrail_events").insert({
        chat_session_id: sessionId,
        answer_trace_id: answerTraceId,
        guardrail_type: guardrailType,
        user_message: userMessage,
        action_taken: "blocked",
        severity: "medium",
      });
      if (error) throw error;
    }
  }

  async upsertUser(input: { id?: string; email?: string; phone?: string }): Promise<string> {
    this.assertConfigured();
    const id = input.id ? toStableUuid(input.id) : randomUUID();
    const payload: Record<string, unknown> = {
      id,
      metadata: {
        source: "chatbot",
      },
    };

    if (typeof input.email !== "undefined") {
      payload.email = input.email || null;
    }

    if (typeof input.phone !== "undefined") {
      payload.phone = input.phone || null;
    }

    const { error } = await this.client
      .from("users")
      .upsert(payload, { onConflict: "id" });
    if (error) throw error;

    return id;
  }

  async getOrCreateChat(userId: string, chatId?: string): Promise<string> {
    this.assertConfigured();
    const normalizedUserId = toStableUuid(userId);

    if (chatId && (await this.chatBelongsToUser(normalizedUserId, chatId))) {
      return chatId;
    }

    const newChatId = randomUUID();
    const { error } = await this.client.from("chats").insert({
      id: newChatId,
      user_id: normalizedUserId,
      metadata: {
        source: "chatbot",
      },
    });
    if (error) throw error;
    return newChatId;
  }

  async chatBelongsToUser(userId: string, chatId: string): Promise<boolean> {
    if (!this.isConfigured() || !userId || !chatId) return false;
    const normalizedUserId = toStableUuid(userId);

    const { data, error } = await this.client
      .from("chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", normalizedUserId)
      .maybeSingle();

    return !error && Boolean(data?.id);
  }

  async ensureChat(userId: string, chatId: string): Promise<void> {
    this.assertConfigured();
    if (!userId || !chatId) return;
    const normalizedUserId = toStableUuid(userId);

    const { error } = await this.client
      .from("chats")
      .upsert(
        {
          id: chatId,
          user_id: normalizedUserId,
          metadata: {
            source: "chatbot",
          },
        },
        { onConflict: "id" },
      );
    if (error) throw error;

    await this.ensureAdminChatSession(normalizedUserId, chatId);
  }

  async addMessage(chatId: string, role: MessageRole, content: string): Promise<void> {
    this.assertConfigured();

    const { error } = await this.client.from("messages").insert({
      id: randomUUID(),
      chat_id: chatId,
      role,
      content,
      metadata: {
        source: "chatbot",
      },
    });
    if (error) throw error;

    await this.addAdminChatMessage(chatId, role, content);
  }

  async getRecentMessages(chatId: string, limit = 6): Promise<Array<{ role: MessageRole; content: string }>> {
    if (!this.isConfigured()) return [];

    const { data, error } = await this.client
      .from("messages")
      .select("role, content, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.reverse().map((item) => ({
      role: item.role as MessageRole,
      content: item.content as string,
    }));
  }

  async getRecentMessagesForUser(
    userId: string,
    limit = 12,
  ): Promise<Array<{ role: MessageRole; content: string }>> {
    if (!this.isConfigured()) return [];
    const normalizedUserId = toStableUuid(userId);

    const { data, error } = await this.client
      .from("messages")
      .select("role, content, created_at, chats!inner(user_id)")
      .eq("chats.user_id", normalizedUserId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.reverse().map((item) => ({
      role: item.role as MessageRole,
      content: item.content as string,
    }));
  }

  async logEvent(event: string, metadata: Record<string, unknown>): Promise<void> {
    this.assertConfigured();

    const { error } = await this.client.from("logs").insert({ id: randomUUID(), event, metadata });
    if (error) throw error;

    if (event === "chat_processed") {
      await this.mirrorChatProcessed(metadata);
    }
  }

  async getRecentLogs(limit = 50): Promise<Array<Record<string, unknown>>> {
    if (!this.isConfigured()) return [];

    const { data } = await this.client
      .from("logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    return (data ?? []) as Array<Record<string, unknown>>;
  }
}

export const supabaseService = new SupabaseService();
