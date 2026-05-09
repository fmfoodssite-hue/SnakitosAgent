import { format } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  AdminProfile,
  AnalyticsSnapshot,
  BotSettingsRecord,
  ChatMessageRecord,
  ChatRetrievedContextRecord,
  DashboardSnapshot,
  FailedQuestionRecord,
  KnowledgeDocumentRecord,
  SyncLogRecord,
} from "@/lib/admin/types";
import {
  mockAnalytics,
  mockBotSettings,
  mockChatMessages,
  mockDashboardSnapshot,
  mockFailedQuestions,
  mockKnowledgeDocuments,
  mockSyncLogs,
} from "@/lib/admin/mock-data";

type ChatFilters = {
  from?: string;
  to?: string;
  intent?: string;
  status?: string;
};

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeRetrievedContext(value: unknown): ChatRetrievedContextRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeMetadata(item))
    .filter((item) => Object.keys(item).length > 0)
    .map((item, index) => ({
      id: String(item.id ?? `context-${index}`),
      name: String(item.name ?? item.title ?? item.category ?? "Knowledge match"),
      source: String(item.source ?? "unknown"),
      type: String(item.type ?? "knowledge"),
      category: String(item.category ?? "general"),
      link: item.link ? String(item.link) : undefined,
    }));
}

function normalizeIntent(value: unknown): ChatMessageRecord["intent"] {
  return value === "product" || value === "order" || value === "general" ? value : "general";
}

function deriveSourceLabel(
  intent: ChatMessageRecord["intent"],
  metadata: Record<string, unknown>,
  retrievedContext: ChatRetrievedContextRecord[],
) {
  const explicit = metadata.sourceLabel ?? metadata.responseSource ?? metadata.source;
  if (typeof explicit === "string" && explicit.trim()) {
    return explicit;
  }

  if (retrievedContext.length > 0) {
    const sources = new Set(retrievedContext.map((item) => item.source));
    if (sources.has("pinecone")) return "RAG + Pinecone";
    if (sources.has("general_query_pack")) return "General query RAG";
    if (sources.has("capability_doc")) return "Capability knowledge";
    return "Knowledge retrieval";
  }

  if (intent === "product") return "Catalog lookup";
  if (intent === "order") return "Order support";
  return "General support";
}

function deriveDetailsSummary(
  intent: ChatMessageRecord["intent"],
  metadata: Record<string, unknown>,
  retrievedContext: ChatRetrievedContextRecord[],
) {
  const explicit = metadata.detailsSummary ?? metadata.summary;
  if (typeof explicit === "string" && explicit.trim()) {
    return explicit;
  }

  if (retrievedContext.length > 0) {
    return `Used ${retrievedContext.length} knowledge match${retrievedContext.length === 1 ? "" : "es"} for the reply.`;
  }

  if (intent === "product") {
    return "Answered from product search or recommendation flow.";
  }

  if (intent === "order") {
    return "Answered from order support flow.";
  }

  return "Answered from the chatbot support flow.";
}

function normalizeChatRecord(row: Record<string, unknown>): ChatMessageRecord {
  const metadata = normalizeMetadata(row.metadata);
  const retrievedContext = normalizeRetrievedContext(
    row.retrieved_context ?? metadata.retrievedContext ?? metadata.ragContext ?? metadata.knowledge,
  );
  const intent = normalizeIntent(row.intent ?? metadata.intent);

  return {
    id: String(row.id ?? crypto.randomUUID()),
    sessionId: String(row.session_id ?? row.chat_id ?? "unknown-session"),
    userId: String(row.user_id ?? "unknown-user"),
    userQuery: String(row.user_query ?? row.content ?? row.query ?? ""),
    aiResponse: String(row.ai_response ?? row.response ?? ""),
    intent,
    status: ((row.status as ChatMessageRecord["status"]) ||
      ((row.success as boolean) ? "success" : "failure")) as ChatMessageRecord["status"],
    confidenceScore: Number(row.confidence_score ?? 0.75),
    responseTimeMs: Number(row.response_time_ms ?? 1200),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    sourceLabel: deriveSourceLabel(intent, metadata, retrievedContext),
    detailsSummary: deriveDetailsSummary(intent, metadata, retrievedContext),
    retrievedContext,
    metadata,
  };
}

export async function getAdminProfile(userId: string, email: string): Promise<AdminProfile | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return { id: userId, email, fullName: "Admin User", role: "admin" };
  }

  const { data } = await supabase
    .from("admins")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    id: String(data.id),
    email: String(data.email ?? email),
    fullName: String(data.full_name ?? "Admin User"),
    role: "admin",
  };
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const analytics = await getAnalyticsSnapshot();
  const chats = await getChatMessages();
  const failed = await getFailedQuestions();
  const syncLogs = await getSyncLogs();

  return {
    ...mockDashboardSnapshot,
    metrics: [
      { ...mockDashboardSnapshot.metrics[0], value: chats.length ? `${chats.length}` : "12.8k" },
      { ...mockDashboardSnapshot.metrics[3], value: `${analytics.ai.successRate.toFixed(1)}%` },
      { ...mockDashboardSnapshot.metrics[4], value: `${failed.filter((item) => !item.resolved).length}` },
      { ...mockDashboardSnapshot.metrics[6], value: `${analytics.conversion.productClicks}` },
      ...mockDashboardSnapshot.metrics.slice(1, 3),
      ...mockDashboardSnapshot.metrics.slice(5, 6),
    ].slice(0, 7),
    liveFeed: chats.slice(0, 5),
    failedQuestions: failed.slice(0, 3),
    syncLogs: syncLogs.slice(0, 4),
    analytics,
  };
}

export async function getChatMessages(filters?: {
  from?: string;
  to?: string;
  intent?: string;
  status?: string;
}): Promise<ChatMessageRecord[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return filterChatMessages(mockChatMessages, filters);
  }

  try {
    const auditRows = await getChatMessagesFromAuditLogs(supabase, filters);
    if (auditRows.length > 0) {
      return auditRows;
    }

    let query = supabase
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (filters?.from) {
      query = query.gte("created_at", filters.from);
    }
    if (filters?.to) {
      query = query.lte("created_at", filters.to);
    }
    if (filters?.intent) {
      query = query.eq("intent", filters.intent);
    }
    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      return data.map((row) => normalizeChatRecord(row as Record<string, unknown>));
    }

    const recoveredRows = await getChatMessagesFromConversationTables(supabase, filters);
    if (recoveredRows.length > 0) {
      return recoveredRows;
    }

    return filterChatMessages(mockChatMessages, filters);
  } catch {
    return filterChatMessages(mockChatMessages, filters);
  }
}

function filterChatMessages(
  rows: ChatMessageRecord[],
  filters?: ChatFilters,
) {
  return rows.filter((row) => matchesChatFilters(row, filters));
}

function matchesChatFilters(row: ChatMessageRecord, filters?: ChatFilters) {
  const created = new Date(row.createdAt).getTime();
  const from = filters?.from ? new Date(filters.from).getTime() : Number.NEGATIVE_INFINITY;
  const to = filters?.to ? new Date(filters.to).getTime() : Number.POSITIVE_INFINITY;
  if (created < from || created > to) return false;
  if (filters?.intent && row.intent !== filters.intent) return false;
  if (filters?.status && row.status !== filters.status) return false;
  return true;
}

async function getChatMessagesFromAuditLogs(
  supabase: SupabaseClient,
  filters?: ChatFilters,
): Promise<ChatMessageRecord[]> {
  const { data, error } = await supabase
    .from("logs")
    .select("id, event, metadata, created_at")
    .in("event", ["chat_processed", "chat_error"])
    .order("created_at", { ascending: false })
    .limit(150);

  if (error || !data) {
    return [];
  }

  return data
    .map((row) => {
      const metadata = normalizeMetadata(row.metadata);
      const retrievedContext = normalizeRetrievedContext(
        metadata.retrievedContext ?? metadata.ragContext ?? metadata.knowledge,
      );
      const intent = normalizeIntent(metadata.intent);
      const sourceLabel = deriveSourceLabel(intent, metadata, retrievedContext);
      const detailsSummary = deriveDetailsSummary(intent, metadata, retrievedContext);
      const status =
        row.event === "chat_error" || metadata.status === "failure" ? "failure" : "success";
      const userQuery = String(
        metadata.userMessage ?? metadata.query ?? metadata.message ?? "",
      ).trim();
      const aiResponse = String(
        metadata.response ?? metadata.errorMessage ?? metadata.error ?? "",
      ).trim();

      return {
        id: String(row.id ?? crypto.randomUUID()),
        sessionId: String(metadata.chatId ?? metadata.sessionId ?? "unknown-session"),
        userId: String(metadata.userId ?? "unknown-user"),
        userQuery,
        aiResponse,
        intent,
        status,
        confidenceScore: Number(metadata.confidenceScore ?? 0.82),
        responseTimeMs: Number(metadata.responseTimeMs ?? 0),
        createdAt: String(row.created_at ?? new Date().toISOString()),
        sourceLabel,
        detailsSummary,
        retrievedContext,
        metadata,
      } satisfies ChatMessageRecord;
    })
    .filter((row) => (row.userQuery || row.aiResponse) && matchesChatFilters(row, filters));
}

function inferIntentFromConversation(userQuery: string, aiResponse: string): ChatMessageRecord["intent"] {
  const combined = `${userQuery} ${aiResponse}`.toLowerCase();
  if (/(track|order|dispatch|parcel|courier|address|cancel order)/.test(combined)) {
    return "order";
  }
  if (/(snack|chips|flavor|weight|price|deal|bundle|gift|product|banana|coco|stix|wafer)/.test(combined)) {
    return "product";
  }
  return "general";
}

async function getChatMessagesFromConversationTables(
  supabase: SupabaseClient,
  filters?: ChatFilters,
): Promise<ChatMessageRecord[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, chat_id, role, content, created_at, chats!inner(user_id)")
    .order("created_at", { ascending: true })
    .limit(400);

  if (error || !data) {
    return [];
  }

  const rows = data as Array<Record<string, unknown>>;
  const normalized = rows.map((row) => {
    const chatInfo = normalizeMetadata(row.chats);
    return {
      id: String(row.id ?? crypto.randomUUID()),
      chatId: String(row.chat_id ?? "unknown-session"),
      role: String(row.role ?? ""),
      content: String(row.content ?? ""),
      createdAt: String(row.created_at ?? new Date().toISOString()),
      userId: String(chatInfo.user_id ?? "unknown-user"),
    };
  });

  const byChat = new Map<string, typeof normalized>();
  normalized.forEach((row) => {
    const list = byChat.get(row.chatId) ?? [];
    list.push(row);
    byChat.set(row.chatId, list);
  });

  const records: ChatMessageRecord[] = [];

  byChat.forEach((items, chatId) => {
    for (let index = 0; index < items.length; index += 1) {
      const current = items[index];
      if (current.role !== "user") {
        continue;
      }

      const nextBot = items.slice(index + 1).find((item) => item.role === "bot");
      const intent = inferIntentFromConversation(current.content, nextBot?.content ?? "");

      records.push({
        id: current.id,
        sessionId: chatId,
        userId: current.userId,
        userQuery: current.content,
        aiResponse: nextBot?.content ?? "",
        intent,
        status: nextBot?.content ? "success" : "failure",
        confidenceScore: nextBot?.content ? 0.68 : 0.3,
        responseTimeMs: 0,
        createdAt: current.createdAt,
        sourceLabel: "Conversation history",
        detailsSummary: "Recovered from persisted user and bot messages.",
        retrievedContext: [],
        metadata: {
          recoveredFrom: "messages",
        },
      });
    }
  });

  return records
    .filter((row) => matchesChatFilters(row, filters))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 100);
}

export async function getFailedQuestions(): Promise<FailedQuestionRecord[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return mockFailedQuestions;
  }

  const { data, error } = await supabase
    .from("failed_questions")
    .select("*")
    .order("frequency", { ascending: false });

  if (error || !data) {
    return mockFailedQuestions;
  }

  return data.map((row) => ({
    id: String(row.id),
    question: String(row.question),
    frequency: Number(row.frequency ?? 1),
    category: String(row.category ?? "general"),
    latestAttemptAt: String(row.latest_attempt_at ?? row.created_at ?? new Date().toISOString()),
    suggestedAnswer: String(row.suggested_answer ?? ""),
    resolved: Boolean(row.resolved),
  }));
}

export async function getKnowledgeDocuments(): Promise<KnowledgeDocumentRecord[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return mockKnowledgeDocuments;
  }

  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error || !data) {
    return mockKnowledgeDocuments;
  }

  return data.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    sourceType: (row.source_type as KnowledgeDocumentRecord["sourceType"]) ?? "manual",
    status: (row.status as KnowledgeDocumentRecord["status"]) ?? "indexed",
    chunkCount: Number(row.chunk_count ?? 0),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    summary: String(row.summary ?? ""),
  }));
}

export async function getSyncLogs(): Promise<SyncLogRecord[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return mockSyncLogs;
  }

  const { data, error } = await supabase
    .from("shopify_sync_logs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    return mockSyncLogs;
  }

  return data.map((row) => ({
    id: String(row.id),
    syncType: (row.sync_type as SyncLogRecord["syncType"]) ?? "products",
    status: (row.status as SyncLogRecord["status"]) ?? "success",
    recordsProcessed: Number(row.records_processed ?? 0),
    startedAt: String(row.started_at ?? new Date().toISOString()),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    message: String(row.message ?? ""),
  }));
}

export async function getBotSettings(): Promise<BotSettingsRecord> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return mockBotSettings;
  }

  const { data, error } = await supabase
    .from("bot_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return mockBotSettings;
  }

  return {
    botName: String(data.bot_name ?? mockBotSettings.botName),
    welcomeMessage: String(data.welcome_message ?? mockBotSettings.welcomeMessage),
    fallbackMessage: String(data.fallback_message ?? mockBotSettings.fallbackMessage),
    tone: (data.tone as BotSettingsRecord["tone"]) ?? mockBotSettings.tone,
    enableOrderTracking: Boolean(data.enable_order_tracking ?? true),
    enableProductRecommendations: Boolean(data.enable_product_recommendations ?? true),
    supportEmail: String(data.support_email ?? mockBotSettings.supportEmail),
    supportWhatsapp: String(data.support_whatsapp ?? mockBotSettings.supportWhatsapp),
  };
}

export async function getAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return mockAnalytics;
  }

  try {
    const [messages, events, failed] = await Promise.all([
      supabase.from("chat_messages").select("*").limit(500),
      supabase.from("analytics_events").select("*").limit(1000),
      supabase.from("failed_questions").select("*").limit(100),
    ]);

    if (messages.error || !messages.data || events.error || !events.data) {
      return mockAnalytics;
    }

    const chatRows = messages.data.map((row) => normalizeChatRecord(row as Record<string, unknown>));
    const sessions = new Set(chatRows.map((row) => row.sessionId));
    const users = new Set(chatRows.map((row) => row.userId));
    const successCount = chatRows.filter((row) => row.status === "success").length;
    const avgTime =
      chatRows.reduce((sum, row) => sum + row.responseTimeMs, 0) / Math.max(chatRows.length, 1);
    const eventRows = events.data as Array<Record<string, unknown>>;

    const countEvent = (name: string) =>
      eventRows.filter((event) => String(event.event_name ?? event.event) === name).length;

    return {
      behavior: {
        totalUsers: users.size,
        returningUsers: Math.floor(users.size * 0.34),
        averageSessionDurationSec: 260,
        queriesPerSession: Number((chatRows.length / Math.max(sessions.size, 1)).toFixed(1)),
      },
      query: {
        topQuestions: groupTop(chatRows.map((row) => row.userQuery)),
        topProducts: groupTop(
          eventRows
            .filter((event) => String(event.event_name ?? event.event) === "product_click")
            .map((event) => {
              const metadata =
                event.metadata && typeof event.metadata === "object"
                  ? (event.metadata as Record<string, unknown>)
                  : {};
              return String(event.label ?? metadata.product_name ?? "Product");
            }),
        ),
        intents: [
          { name: "Product", value: chatRows.filter((row) => row.intent === "product").length },
          { name: "Order", value: chatRows.filter((row) => row.intent === "order").length },
          { name: "General", value: chatRows.filter((row) => row.intent === "general").length },
        ],
      },
      ai: {
        successRate: Number(((successCount / Math.max(chatRows.length, 1)) * 100).toFixed(1)),
        failureRate: Number((100 - (successCount / Math.max(chatRows.length, 1)) * 100).toFixed(1)),
        averageResponseTimeMs: Math.round(avgTime),
        confidenceBuckets: [
          { bucket: "0.0-0.4", value: chatRows.filter((row) => row.confidenceScore < 0.4).length },
          {
            bucket: "0.4-0.6",
            value: chatRows.filter((row) => row.confidenceScore >= 0.4 && row.confidenceScore < 0.6)
              .length,
          },
          {
            bucket: "0.6-0.8",
            value: chatRows.filter((row) => row.confidenceScore >= 0.6 && row.confidenceScore < 0.8)
              .length,
          },
          { bucket: "0.8-1.0", value: chatRows.filter((row) => row.confidenceScore >= 0.8).length },
        ],
      },
      conversion: {
        productClicks: countEvent("product_click"),
        addToCart: countEvent("add_to_cart"),
        ordersInitiated: countEvent("order_initiated"),
      },
      topFailedQueries:
        failed.data?.map((item) => ({ label: String(item.question), value: Number(item.frequency ?? 1) })) ??
        mockAnalytics.topFailedQueries,
      failureCategories: groupByCategory(
        failed.data?.map((item) => String(item.category ?? "general")) ?? [],
      ),
      dailyVolume: buildDailyVolume(chatRows, eventRows),
      hourlyUsage: buildHourlyUsage(chatRows),
    };

    function groupTop(values: string[]) {
      const counts = new Map<string, number>();
      values.forEach((value) => {
        const key = value.trim();
        if (!key) return;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, value]) => ({ label, value }));
    }

    function groupByCategory(values: string[]) {
      const counts = new Map<string, number>();
      values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
      return [...counts.entries()].map(([name, value]) => ({ name, value }));
    }

    function buildDailyVolume(rows: ChatMessageRecord[], eventRows: Array<Record<string, unknown>>) {
      const days = new Map<string, { chats: number; sales: number }>();

      rows.forEach((row) => {
        const key = format(new Date(row.createdAt), "MMM d");
        const current = days.get(key) ?? { chats: 0, sales: 0 };
        current.chats += 1;
        days.set(key, current);
      });

      eventRows.forEach((event) => {
        if (String(event.event_name ?? event.event) !== "order_initiated") return;
        const key = format(new Date(String(event.created_at ?? new Date().toISOString())), "MMM d");
        const current = days.get(key) ?? { chats: 0, sales: 0 };
        current.sales += 1;
        days.set(key, current);
      });

      return [...days.entries()].map(([label, data]) => ({ label, ...data }));
    }

    function buildHourlyUsage(rows: ChatMessageRecord[]) {
      const hours = new Map<string, number>();
      rows.forEach((row) => {
        const hour = `${String(new Date(row.createdAt).getHours()).padStart(2, "0")}:00`;
        hours.set(hour, (hours.get(hour) ?? 0) + 1);
      });
      return [...hours.entries()].map(([hour, chats]) => ({ hour, chats }));
    }
  } catch {
    return mockAnalytics;
  }
}
