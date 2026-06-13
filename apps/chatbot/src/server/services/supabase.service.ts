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

// ---------------------------------------------------------------------------
// Helper: Is a string a valid UUID?
// ---------------------------------------------------------------------------
function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ---------------------------------------------------------------------------
// Helper: Derive a stable UUID from any string (deterministic)
// ---------------------------------------------------------------------------
function toStableUuid(value: string): string {
  if (isValidUuid(value)) return value;
  // Pad or hash to produce a UUID-shaped string
  const padded = value.replace(/-/g, "").padEnd(32, "0").slice(0, 32);
  return `${padded.slice(0, 8)}-${padded.slice(8, 12)}-4${padded.slice(13, 16)}-a${padded.slice(17, 20)}-${padded.slice(20, 32)}`;
}

export class SupabaseService {
  public readonly client = supabaseClient;

  // -------------------------------------------------------------------------
  // Token estimation
  // -------------------------------------------------------------------------
  private estimateTokens(input: string): number {
    return Math.max(1, Math.ceil((input || "").length / 4));
  }

  private estimateCost(inputTokens: number, outputTokens: number): number {
    return Number(
      (((inputTokens / 1_000_000) * 0.4) + ((outputTokens / 1_000_000) * 1.6)).toFixed(6),
    );
  }

  // -------------------------------------------------------------------------
  // Chat sessions — uses the EXISTING schema:
  //   id uuid PK, user_id uuid (now nullable), user_identifier text, handoff_status text
  //
  // Strategy: chatId IS the session id (UUID). We store it directly as `id`.
  // -------------------------------------------------------------------------
  private async getAdminSessionInternalId(chatId: string): Promise<string | null> {
    if (!chatId) return null;

    // Primary: chatId is the UUID primary key
    if (isValidUuid(chatId)) {
      const { data } = await this.client
        .from("chat_sessions")
        .select("id")
        .eq("id", chatId)
        .maybeSingle();
      if (data?.id) return String(data.id);
    }

    // Fallback: chatId stored in user_identifier
    const { data } = await this.client
      .from("chat_sessions")
      .select("id")
      .eq("user_identifier", chatId)
      .maybeSingle();

    return data?.id ? String(data.id) : null;
  }

  async ensureAdminChatSession(userId: string, chatId: string): Promise<string | null> {
    if (!chatId) return null;

    // Look for existing session
    const existingId = await this.getAdminSessionInternalId(chatId);
    if (existingId) {
      // Update handoff_status — non-fatal
      Promise.resolve(
        this.client
          .from("chat_sessions")
          .update({ handoff_status: "none", updated_at: new Date().toISOString() })
          .eq("id", existingId),
      ).catch(() => undefined);
      return existingId;
    }

    // Create new session
    // chatId is used as the id (UUID) when valid, otherwise we generate one
    const sessionUuid = isValidUuid(chatId) ? chatId : randomUUID();
    const userUuid = userId ? toStableUuid(userId) : null;

    const { data, error } = await this.client
      .from("chat_sessions")
      .insert({
        id: sessionUuid,
        user_id: userUuid,            // nullable after migration
        user_identifier: userId || null,
        handoff_status: "none",
        source: "chatbot",
      })
      .select("id")
      .maybeSingle();

    if (error) {
      // If insert failed (e.g. duplicate), try to fetch again
      const retry = await this.getAdminSessionInternalId(chatId);
      return retry;
    }

    return data?.id ? String(data.id) : null;
  }

  // -------------------------------------------------------------------------
  // Chat messages — uses BOTH existing columns AND new columns added by migration
  //   Existing: session_id, user_id, role, user_query, ai_response,
  //             intent, status, confidence_score, response_time_ms,
  //             retrieved_context, metadata
  //   New: user_message, detected_intent, retrieved_sources, is_failed_answer
  // -------------------------------------------------------------------------
  async addAdminChatMessage(chatId: string, role: MessageRole, content: string): Promise<void> {
    const sessionId = await this.getAdminSessionInternalId(chatId);
    if (!sessionId) return;

    const now = new Date().toISOString();

    if (role === "user") {
      Promise.resolve(
        this.client.from("chat_messages").insert({
          session_id: sessionId,
          role: "user",
          intent: "general",
          status: "success",
          confidence_score: 0.75,
          response_time_ms: 0,
          retrieved_context: [],
          metadata: {},
          user_query: content,
          user_message: content,
          created_at: now,
        }),
      ).catch(() => undefined);
      return;
    }

    // Bot message: try to update the most recent user message row first
    const { data: pendingMsg } = await this.client
      .from("chat_messages")
      .select("id, metadata")
      .eq("session_id", sessionId)
      .is("ai_response", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingMsg?.id) {
      Promise.resolve(
        this.client
          .from("chat_messages")
          .update({
            ai_response: content,
            metadata: pendingMsg.metadata ?? {},
          })
          .eq("id", pendingMsg.id),
      ).catch(() => undefined);
      return;
    }

    // No pending row — insert a new bot row
    Promise.resolve(
      this.client.from("chat_messages").insert({
        session_id: sessionId,
        role: "assistant",
        intent: "general",
        status: "success",
        confidence_score: 0.75,
        response_time_ms: 0,
        retrieved_context: [],
        metadata: {},
        user_query: "",
        ai_response: content,
        created_at: now,
      }),
    ).catch(() => undefined);
  }

  // -------------------------------------------------------------------------
  // Mirror chat processed — write to all new production telemetry tables
  // -------------------------------------------------------------------------
  async mirrorChatProcessed(metadata: Record<string, unknown>): Promise<void> {
    const chatId        = typeof metadata.chatId === "string" ? metadata.chatId : "";
    const userId        = typeof metadata.userId === "string" ? metadata.userId : "";
    const userMessage   = typeof metadata.userMessage === "string" ? metadata.userMessage : "";
    const response      = typeof metadata.response === "string" ? metadata.response : "";
    const intent        = typeof metadata.intent === "string" ? metadata.intent : "general";
    const responseTimeMs = typeof metadata.responseTimeMs === "number" ? metadata.responseTimeMs : 0;
    const retrievedContext = Array.isArray(metadata.retrievedContext) ? metadata.retrievedContext : [];
    const sourceLabel   = typeof metadata.sourceLabel === "string" ? metadata.sourceLabel : "General support";

    // Real scores from AI service, or heuristics
    const hadSource             = retrievedContext.length > 0;
    const confidenceScore       = typeof metadata.confidenceScore       === "number" ? metadata.confidenceScore       : (hadSource ? 0.72 : 0.28);
    const retrievalConfidence   = typeof metadata.retrievalConfidence   === "number" ? metadata.retrievalConfidence   : (hadSource ? 0.68 : 0.05);
    const groundingScore        = typeof metadata.groundingScore        === "number" ? metadata.groundingScore        : (hadSource ? 0.70 : 0.05);
    const hallucinationRisk     = typeof metadata.hallucinationRisk     === "number" ? metadata.hallucinationRisk     : (hadSource ? 0.25 : 0.88);
    const retrievalLatencyMs    = typeof metadata.retrievalLatencyMs    === "number" ? metadata.retrievalLatencyMs    : 0;
    const guardrailTriggered    = typeof metadata.guardrailTriggered    === "boolean" ? metadata.guardrailTriggered   : false;
    const guardrailType         = typeof metadata.guardrailType         === "string"  ? metadata.guardrailType        : null;

    // Ensure session exists
    const sessionId = (await this.ensureAdminChatSession(userId, chatId)) ?? (await this.getAdminSessionInternalId(chatId));
    if (!sessionId) return;

    const inputTokens    = this.estimateTokens(userMessage);
    const outputTokens   = this.estimateTokens(response);
    const totalTokens    = inputTokens + outputTokens;
    const estimatedCost  = this.estimateCost(inputTokens, outputTokens);

    // Update the latest chat_message row with enriched data
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

      Promise.resolve(
        this.client
          .from("chat_messages")
          .update({
            intent: intent === "product" || intent === "order" ? intent : "general",
            retrieved_context: retrievedContext,
            retrieved_sources: retrievedContext,
            is_failed_answer: !hadSource && intent === "general",
            confidence_score: confidenceScore,
            response_time_ms: responseTimeMs,
            metadata: mergedMetadata,
          })
          .eq("id", latestMessage.id),
      ).catch(() => undefined);
    }

    // Write answer trace
    let answerTraceId: string | null = null;
    try {
      const { data: traceData } = await this.client
        .from("answer_traces")
        .insert({
          chat_session_id:     sessionId,
          user_question:       userMessage,
          bot_answer:          response,
          model:               config.app.openAiModel,
          confidence_score:    confidenceScore,
          retrieval_confidence: retrievalConfidence,
          grounding_score:     groundingScore,
          hallucination_risk:  hallucinationRisk,
          had_source:          hadSource,
          used_stale_source:   false,
          latency_ms:          responseTimeMs,
          retrieval_latency_ms: retrievalLatencyMs,
          input_tokens:        inputTokens,
          output_tokens:       outputTokens,
          total_tokens:        totalTokens,
          estimated_cost:      estimatedCost,
          reviewed_status:     "unreviewed",
        })
        .select("id")
        .maybeSingle();
      answerTraceId = traceData?.id ? String(traceData.id) : null;
    } catch {
      // Non-fatal — table may not exist yet
    }

    // Write token usage
    try {
      await this.client.from("token_usage_logs").insert({
        chat_session_id:  sessionId,
        answer_trace_id:  answerTraceId,
        model:            config.app.openAiModel,
        input_tokens:     inputTokens,
        output_tokens:    outputTokens,
        embedding_tokens: 0,
        total_tokens:     totalTokens,
        estimated_cost:   estimatedCost,
      });
    } catch {
      // Non-fatal
    }

    // Log failed answers (no knowledge source found)
    if (!hadSource) {
      try {
        await this.client.from("failed_answers").insert({
          answer_trace_id:  answerTraceId,
          chat_session_id:  sessionId,
          user_question:    userMessage,
          bot_answer:       response,
          root_cause:       "missing_source",
          severity:         "medium",
          status:           "open",
          recommended_fix:  "Add or improve trusted knowledge for this query.",
          before_confidence: confidenceScore,
        });
      } catch {
        // Non-fatal
      }
    }

    // Log guardrail events
    if (guardrailTriggered && guardrailType) {
      try {
        await this.client.from("guardrail_events").insert({
          chat_session_id:  sessionId,
          answer_trace_id:  answerTraceId,
          guardrail_type:   guardrailType,
          user_message:     userMessage,
          action_taken:     "blocked",
          severity:         "medium",
        });
      } catch {
        // Non-fatal
      }
    }

    // Increment retrieval count on knowledge sources
    if (hadSource && retrievedContext.length > 0) {
      const sourceIds = retrievedContext
        .map((ctx: unknown) => {
          const c = ctx as Record<string, unknown>;
          return typeof c.id === "string" ? c.id : null;
        })
        .filter((id): id is string => Boolean(id))
        .slice(0, 5);

      for (const sourceId of sourceIds) {
        try {
          await this.client
            .rpc("increment_source_retrieval", { p_source_id: sourceId })
            .maybeSingle();
        } catch {
          // Non-fatal — RPC may not exist yet
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Legacy chatbot tables (chats, messages, users, logs) — unchanged
  // -------------------------------------------------------------------------
  async upsertUser(input: { id?: string; email?: string; phone?: string }): Promise<string> {
    const id = input.id || randomUUID();
    await this.client
      .from("users")
      .upsert({ id, email: input.email ?? null, phone: input.phone ?? null }, { onConflict: "id" });
    return id;
  }

  async getOrCreateChat(userId: string, chatId?: string): Promise<string> {
    if (chatId && (await this.chatBelongsToUser(userId, chatId))) {
      return chatId;
    }
    const newChatId = randomUUID();
    await this.client.from("chats").insert({ id: newChatId, user_id: userId });
    return newChatId;
  }

  async chatBelongsToUser(userId: string, chatId: string): Promise<boolean> {
    if (!userId || !chatId) return false;
    const { data, error } = await this.client
      .from("chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", userId)
      .maybeSingle();
    return !error && Boolean(data?.id);
  }

  async ensureChat(userId: string, chatId: string): Promise<void> {
    if (!userId || !chatId) return;
    await this.client
      .from("chats")
      .upsert({ id: chatId, user_id: userId }, { onConflict: "id" });
    await this.ensureAdminChatSession(userId, chatId).catch(() => undefined);
  }

  async addMessage(chatId: string, role: MessageRole, content: string): Promise<void> {
    await this.client.from("messages").insert({ id: randomUUID(), chat_id: chatId, role, content });
    await this.addAdminChatMessage(chatId, role, content).catch(() => undefined);
  }

  async getRecentMessages(chatId: string, limit = 6): Promise<Array<{ role: MessageRole; content: string }>> {
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

  async getRecentMessagesForUser(userId: string, limit = 12): Promise<Array<{ role: MessageRole; content: string }>> {
    const { data, error } = await this.client
      .from("messages")
      .select("role, content, created_at, chats!inner(user_id)")
      .eq("chats.user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.reverse().map((item) => ({
      role: item.role as MessageRole,
      content: item.content as string,
    }));
  }

  async logEvent(event: string, metadata: Record<string, unknown>): Promise<void> {
    await this.client.from("logs").insert({ id: randomUUID(), event, metadata });
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
