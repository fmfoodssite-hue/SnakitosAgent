import { createClient } from "@supabase/supabase-js";

type ChatAuditContext = {
  id: string;
  name: string;
  source: string;
  type: string;
  category?: string;
  link?: string;
};

export type AdminInteractionMessage = {
  id: string;
  sessionId: string;
  userId: string;
  query: string;
  response: string;
  intent: string;
  status: string;
  sourceLabel: string;
  detailsSummary: string;
  responseTimeMs: number;
  createdAt: string;
  retrievedContext: ChatAuditContext[];
};

export type AdminInteractionSession = {
  sessionId: string;
  userId: string;
  latestQuery: string;
  latestTimestamp: string;
  messageCount: number;
  messages: AdminInteractionMessage[];
};

function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeContext(value: unknown): ChatAuditContext[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeObject(item))
    .filter((item) => Object.keys(item).length > 0)
    .map((item, index) => ({
      id: String(item.id ?? `ctx-${index}`),
      name: String(item.name ?? item.title ?? "Knowledge match"),
      source: String(item.source ?? "unknown"),
      type: String(item.type ?? "knowledge"),
      category: item.category ? String(item.category) : undefined,
      link: item.link ? String(item.link) : undefined,
    }));
}

function groupSessions(messages: AdminInteractionMessage[]): AdminInteractionSession[] {
  const sessions = new Map<string, AdminInteractionSession>();

  for (const message of messages) {
    const current =
      sessions.get(message.sessionId) ??
      ({
        sessionId: message.sessionId,
        userId: message.userId,
        latestQuery: message.query,
        latestTimestamp: message.createdAt,
        messageCount: 0,
        messages: [],
      } satisfies AdminInteractionSession);

    current.messages.push(message);
    current.messageCount += 1;

    if (new Date(message.createdAt).getTime() >= new Date(current.latestTimestamp).getTime()) {
      current.latestTimestamp = message.createdAt;
      current.latestQuery = message.query || current.latestQuery;
    }

    sessions.set(message.sessionId, current);
  }

  return [...sessions.values()].sort(
    (left, right) =>
      new Date(right.latestTimestamp).getTime() - new Date(left.latestTimestamp).getTime(),
  );
}

async function getInteractionsFromLogs(): Promise<AdminInteractionSession[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("logs")
    .select("id, event, metadata, created_at")
    .in("event", ["chat_processed", "chat_error"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    return [];
  }

  const messages = data
    .map((row) => {
      const metadata = normalizeObject(row.metadata);
      const query = String(metadata.userMessage ?? metadata.query ?? metadata.message ?? "").trim();
      const response = String(metadata.response ?? metadata.error ?? "").trim();
      if (!query && !response) {
        return null;
      }

      return {
        id: String(row.id),
        sessionId: String(metadata.chatId ?? metadata.sessionId ?? "unknown-session"),
        userId: String(metadata.userId ?? "unknown-user"),
        query,
        response,
        intent: String(metadata.intent ?? "general"),
        status: String(metadata.status ?? (row.event === "chat_error" ? "failure" : "success")),
        sourceLabel: String(metadata.sourceLabel ?? metadata.responseSource ?? "Chat flow"),
        detailsSummary: String(
          metadata.detailsSummary ??
            (Array.isArray(metadata.retrievedContext)
              ? `Used ${metadata.retrievedContext.length} knowledge matches.`
              : "Processed by chatbot flow."),
        ),
        responseTimeMs: Number(metadata.responseTimeMs ?? 0),
        createdAt: String(row.created_at ?? new Date().toISOString()),
        retrievedContext: normalizeContext(metadata.retrievedContext),
      } satisfies AdminInteractionMessage;
    })
    .filter((item): item is AdminInteractionMessage => Boolean(item));

  return groupSessions(messages);
}

async function getInteractionsFromMessages(): Promise<AdminInteractionSession[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("messages")
    .select("id, chat_id, role, content, created_at, chats!inner(user_id)")
    .order("created_at", { ascending: true })
    .limit(400);

  if (error || !data) {
    return [];
  }

  const rows = (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? crypto.randomUUID()),
    sessionId: String(row.chat_id ?? "unknown-session"),
    role: String(row.role ?? ""),
    content: String(row.content ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    userId: String(normalizeObject(row.chats).user_id ?? "unknown-user"),
  }));

  const grouped = new Map<string, typeof rows>();
  rows.forEach((row) => {
    const current = grouped.get(row.sessionId) ?? [];
    current.push(row);
    grouped.set(row.sessionId, current);
  });

  const messages: AdminInteractionMessage[] = [];

  grouped.forEach((items, sessionId) => {
    for (let index = 0; index < items.length; index += 1) {
      const userRow = items[index];
      if (userRow.role !== "user") {
        continue;
      }

      const botRow = items.slice(index + 1).find((item) => item.role === "bot");
      messages.push({
        id: userRow.id,
        sessionId,
        userId: userRow.userId,
        query: userRow.content,
        response: botRow?.content ?? "",
        intent: "general",
        status: botRow ? "success" : "failure",
        sourceLabel: "Conversation history",
        detailsSummary: "Recovered from saved user and bot messages.",
        responseTimeMs: 0,
        createdAt: userRow.createdAt,
        retrievedContext: [],
      });
    }
  });

  return groupSessions(
    messages.sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    ),
  );
}

export async function getAdminInteractions(): Promise<AdminInteractionSession[]> {
  const fromLogs = await getInteractionsFromLogs();
  if (fromLogs.length > 0) {
    return fromLogs;
  }

  return getInteractionsFromMessages();
}
