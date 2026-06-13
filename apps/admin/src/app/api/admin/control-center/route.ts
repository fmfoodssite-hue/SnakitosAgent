import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { env } from "@/lib/env";
import { errorResponse } from "@/lib/response";
import type {
  AdminUser,
  AuditLog,
  ChartPoint,
  ControlCenterSnapshot,
  Conversation,
  FailedAnswer,
  FaqItem,
  KnowledgeChunk,
  KnowledgeSource,
  NotificationItem,
  Product,
  PromptVersion,
  SourceHealth,
  Ticket,
} from "@/types";

type JsonRecord = Record<string, unknown>;

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "SA"
  );
}

function mapRoleLabel(role: string | undefined) {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "support_agent":
      return "Support Agent";
    case "content_manager":
      return "Content Manager";
    default:
      return "Viewer";
  }
}

function mapLanguage(value: string | undefined): Conversation["language"] {
  const normalized = value?.toLowerCase();
  if (normalized === "urdu") return "Urdu";
  if (normalized === "roman urdu" || normalized === "roman_urdu") return "Roman Urdu";
  if (normalized === "auto") return "Auto";
  return "English";
}

function statusFromAudit(action: string, details: JsonRecord): AuditLog["status"] {
  if (typeof details.error === "string" && details.error) return "Error";
  if (/fail|error|denied|rejected/i.test(action)) return "Error";
  if (/delete|disable|rollback|logout/i.test(action)) return "Warning";
  return "Success";
}

function priorityFromReason(reason: string): FailedAnswer["priority"] {
  if (/policy|refund|stock|price|missing product|outdated/i.test(reason)) return "High";
  if (/confidence|source|prompt/i.test(reason)) return "Medium";
  return "Low";
}

function normalizeFailedReason(reason: string, hasSources: boolean): FailedAnswer["reason"] {
  if (/policy/i.test(reason)) return "Policy not indexed";
  if (/product/i.test(reason)) return "Missing product info";
  if (/prompt injection/i.test(reason)) return "Prompt injection detected";
  if (/stale|outdated/i.test(reason)) return "Outdated knowledge";
  if (!hasSources) return "No relevant source found";
  return "Low confidence";
}

function groupByLabel(values: string[]) {
  const groups = new Map<string, number>();
  for (const value of values) {
    groups.set(value, (groups.get(value) ?? 0) + 1);
  }
  return [...groups.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([label, value]) => ({ label, value }));
}

function buildDailySeries(dates: string[], days = 7): ChartPoint[] {
  const today = new Date();
  const counts = new Map<string, number>();

  for (const value of dates) {
    const key = value.slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - index - 1));
    const key = date.toISOString().slice(0, 10);
    return {
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      value: counts.get(key) ?? 0,
    };
  });
}

function buildWeeklySeries(items: Array<{ created_at?: string | null; value?: number }>, weeks = 4): ChartPoint[] {
  const now = new Date();
  const buckets = Array.from({ length: weeks }, (_, index) => ({
    label: `Week ${index + 1}`,
    value: 0,
    total: 0,
  }));

  for (const item of items) {
    if (!item.created_at) continue;
    const createdAt = new Date(item.created_at);
    const diffDays = Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000);
    if (diffDays < 0 || diffDays >= weeks * 7) continue;
    const bucketIndex = weeks - 1 - Math.floor(diffDays / 7);
    buckets[bucketIndex].value += item.value ?? 1;
    buckets[bucketIndex].total += 1;
  }

  return buckets.map((bucket) => ({
    label: bucket.label,
    value: bucket.value,
  }));
}

async function queryOr<T>(
  run: () => PromiseLike<{ data: T | null; error: unknown }>,
  fallback: T,
): Promise<T> {
  try {
    const result = await run();
    if (result.error) return fallback;
    return (result.data ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async ({ admin }) => {
    try {
      const supabase = assertServiceClient();

    const [
      adminRows,
      documentRows,
      chunkRows,
      productRows,
      promptRows,
      sessionRows,
      messageRows,
      handoffRows,
      auditRows,
      settingsRows,
    ] = await Promise.all([
      queryOr(
        () =>
          supabase
            .from("admins")
            .select("id, email, full_name, is_active, last_login_at, admin_roles!inner(key)"),
        [],
      ),
      queryOr(() => supabase.from("knowledge_documents").select("*").order("updated_at", { ascending: false }), []),
      queryOr(() => supabase.from("knowledge_chunks").select("*").order("updated_at", { ascending: false }).limit(400), []),
      queryOr(() => supabase.from("shopify_products").select("*").order("last_synced_at", { ascending: false }).limit(200), []),
      queryOr(() => supabase.from("prompt_versions").select("*").order("created_at", { ascending: false }).limit(50), []),
      queryOr(() => supabase.from("chat_sessions").select("*").order("updated_at", { ascending: false }).limit(200), []),
      queryOr(() => supabase.from("chat_messages").select("*").order("created_at", { ascending: false }).limit(400), []),
      queryOr(() => supabase.from("handoff_tickets").select("*").order("created_at", { ascending: false }).limit(200), []),
      queryOr(() => supabase.from("audit_logs").select("*, admins(full_name, email)").order("created_at", { ascending: false }).limit(100), []),
      queryOr(() => supabase.from("settings").select("*").order("key"), []),
    ]);

    const adminsById = new Map<string, { name: string; email: string; role: string; lastActive: string; status: string }>();
    const users: AdminUser[] = (adminRows as Array<Record<string, unknown>>).map((row) => {
      const role = toArray<{ key?: string }>(row.admin_roles)[0]?.key ?? "viewer";
      const user = {
        id: String(row.id),
        name: String(row.full_name ?? row.email ?? "Snakitos Admin"),
        email: String(row.email ?? ""),
        role: mapRoleLabel(role),
        status: row.is_active === false ? "Disabled" : "Active",
        lastActive: formatDate((row.last_login_at as string | null | undefined) ?? (row.updated_at as string | null | undefined)),
        avatar: initials(String(row.full_name ?? row.email ?? "SA")),
      } satisfies AdminUser;

      adminsById.set(user.id, {
        name: user.name,
        email: user.email,
        role,
        lastActive: user.lastActive,
        status: user.status,
      });
      return user;
    });

    const currentUser =
      users.find((user) => user.id === admin.id) ??
      ({
        id: admin.id,
        name: admin.full_name,
        email: admin.email,
        role: mapRoleLabel(admin.role),
        status: "Active",
        lastActive: "Just now",
        avatar: initials(admin.full_name),
      } satisfies AdminUser);

      const settingsMap = new Map<string, JsonRecord>(
        (settingsRows as Array<Record<string, unknown>>).map((row) => [String(row.key), toRecord(row.value)]),
      );
      const guardrailsSetting = settingsMap.get("guardrails") ?? {};
      const generalSettings = settingsMap.get("general") ?? {};
      const notificationSettings = settingsMap.get("notifications") ?? {};
      const rateLimitSettings = settingsMap.get("rate_limits") ?? {};
      const widgetSettings = settingsMap.get("widget") ?? {};
      const modelSettingsValue = settingsMap.get("model_settings") ?? {};
      const budgetSettings = settingsMap.get("token_budget") ?? {};
      const crawlerSettingsValue = settingsMap.get("crawler_settings") ?? {};
      const crawlerRuntimeValue = settingsMap.get("crawler_runtime") ?? {};

    const chunkRowsByDocument = new Map<string, Array<Record<string, unknown>>>();
    for (const row of chunkRows as Array<Record<string, unknown>>) {
      const documentId = String(row.document_id ?? "");
      if (!documentId) continue;
      const current = chunkRowsByDocument.get(documentId) ?? [];
      current.push(row);
      chunkRowsByDocument.set(documentId, current);
    }

    const documentsById = new Map<string, Record<string, unknown>>(
      (documentRows as Array<Record<string, unknown>>).map((row) => [String(row.id), row]),
    );

    const knowledgeSources: KnowledgeSource[] = (documentRows as Array<Record<string, unknown>>).map((row) => {
      const chunks = chunkRowsByDocument.get(String(row.id)) ?? [];
      const sourceType = String(row.source_type ?? "manual").toUpperCase();
      const status = String(row.status ?? "draft");
      const addedBy = adminsById.get(String(row.created_by ?? ""))?.name ?? "System";

      return {
        id: String(row.id),
        name: String(row.title ?? "Untitled source"),
        type:
          sourceType === "DOCX" || sourceType === "TXT" || sourceType === "CSV" || sourceType === "JSONL"
            ? "PDF"
            : (sourceType.charAt(0) + sourceType.slice(1).toLowerCase()) as KnowledgeSource["type"],
        status:
          status === "active"
            ? "Indexed"
            : status === "archived"
              ? "Failed"
              : "Pending",
        chunks: chunks.length,
        lastUpdated: formatDate(String(row.updated_at ?? "")),
        addedBy,
        sampleChunks: chunks.slice(0, 2).map((chunk) => String(chunk.content ?? "").slice(0, 180)),
        relatedConversationIds: [],
      };
    });

    const knowledgeChunks: KnowledgeChunk[] = (chunkRows as Array<Record<string, unknown>>).map((row) => {
      const document = documentsById.get(String(row.document_id ?? ""));
      const content = String(row.content ?? "");
      const metadata = toRecord(row.metadata);
      const exampleQuestions = toArray<string>(metadata.exampleQuestions ?? metadata.example_questions).slice(0, 3);

      return {
        id: String(row.id),
        source: String(document?.title ?? "Unknown source"),
        sourceId: String(row.document_id ?? ""),
        textPreview: content.slice(0, 160),
        fullText: content,
        tokens: Number(row.token_estimate ?? Math.ceil(content.length / 4)),
        embeddingStatus: row.embedding_status === "completed" ? "Indexed" : row.embedding_status === "failed" ? "Failed" : "Pending",
        relevanceScore: Number(metadata.relevanceScore ?? metadata.score ?? 0),
        lastUpdated: formatDate(String(row.updated_at ?? "")),
        exampleQuestions:
          exampleQuestions.length > 0 ? exampleQuestions : [`Inspect chunk ${String(row.chunk_index ?? 0)}`],
      };
    });

    const promptVersions: PromptVersion[] = (promptRows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      version: String(row.version_label ?? "draft"),
      prompt: String(row.system_prompt ?? ""),
      tone: "Professional",
      languageMode: "Auto-detect",
      updatedBy: adminsById.get(String(row.created_by ?? ""))?.name ?? "System",
      date: formatDate(String(row.created_at ?? "")),
    }));

    const activePrompt = (promptRows as Array<Record<string, unknown>>).find((row) => row.is_active === true) ?? (promptRows as Array<Record<string, unknown>>)[0];

    const sessionsById = new Map<string, Record<string, unknown>>(
      (sessionRows as Array<Record<string, unknown>>).map((row) => [String(row.id), row]),
    );

    const conversations: Conversation[] = (messageRows as Array<Record<string, unknown>>).map((row) => {
      const metadata = toRecord(row.metadata);
      const session = sessionsById.get(String(row.session_id ?? ""));
      const rawSources = toArray<unknown>(row.retrieved_sources ?? metadata.retrieved_sources ?? metadata.retrievedContext);
      const sources = rawSources
        .map((item) => {
          if (typeof item === "string") return item;
          const record = toRecord(item);
          return String(record.name ?? record.source ?? "");
        })
        .filter(Boolean)
        .slice(0, 4);

      return {
        id: String(row.id),
        userId: String(session?.user_identifier ?? session?.session_id ?? row.session_id ?? "unknown-user"),
        question: String(row.user_message ?? ""),
        answer: String(row.ai_response ?? ""),
        status:
          row.is_failed_answer === true
            ? "Escalated"
            : row.marked_for_review === true
              ? "Needs Review"
              : "Resolved",
        language: mapLanguage(String(metadata.language ?? session?.language ?? "English")),
        satisfaction: Number(metadata.satisfaction ?? 4),
        confidence: Math.round(Number(metadata.confidence ?? metadata.confidenceScore ?? 0.75) * 100),
        date: formatDate(String(row.created_at ?? "")),
        sources: sources.length > 0 ? sources : ["No source captured"],
        tokensUsed: Number(metadata.tokenUsage ?? metadata.tokensUsed ?? metadata.totalTokens ?? 0),
        responseTime: Number(metadata.responseTimeMs ?? 0) / 1000,
        feedback: String(metadata.feedback ?? (row.is_failed_answer === true ? "Needs attention." : "No feedback captured.")),
        reviewed: row.marked_for_review !== true,
        notes: toArray<string>(metadata.notes),
      };
    });

    const failedAnswers: FailedAnswer[] = conversations
      .filter((conversation) => conversation.status === "Escalated" || conversation.confidence < 60)
      .map((conversation) => {
        const sourceGap = conversation.sources.every((source) => source === "No source captured");
        const reason = normalizeFailedReason(conversation.feedback, !sourceGap);
        return {
          id: conversation.id,
          question: conversation.question,
          reason,
          confidence: conversation.confidence,
          language: conversation.language,
          date: conversation.date,
          priority: priorityFromReason(reason),
          suggestedFix:
            reason === "Policy not indexed"
              ? "Re-sync the trusted policy source and retest refund and shipping questions."
              : reason === "Missing product info"
                ? "Re-sync Shopify product details and re-embed changed product records."
                : sourceGap
                  ? "Add or repair the missing trusted source, then retest this query."
                  : "Review prompt rules and retrieval quality for this failed query.",
          status: "Unresolved" as const,
        };
      })
      .slice(0, 100);

    const tickets: Ticket[] = (handoffRows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.ticket_number ?? row.id),
      userQuestion: String(row.summary ?? "Support handoff"),
      botAnswer: String(toRecord(row.metadata).botAnswer ?? toRecord(row.metadata).bot_answer ?? "Escalated from the chatbot flow."),
      status:
        row.status === "resolved"
          ? "Resolved"
          : row.status === "in_progress"
            ? "Pending"
            : row.status === "escalated"
              ? "Open"
              : "Open",
      priority: row.proof_required === true ? "High" : "Medium",
      assignedTo: adminsById.get(String(row.assigned_to ?? ""))?.name ?? "Unassigned",
      createdAt: formatDate(String(row.created_at ?? "")),
      internalNotes: String(toRecord(row.metadata).internalNotes ?? row.complaint_type ?? "Awaiting admin review."),
      adminReply: String(toRecord(row.metadata).recommendedReply ?? ""),
    }));

    const auditLogs: AuditLog[] = (auditRows as Array<Record<string, unknown>>).map((row) => {
      const details = toRecord(row.details);
      const adminInfo = toRecord(row.admins);
      return {
        id: String(row.id),
        admin: String(adminInfo.full_name ?? "System"),
        action: String(row.action ?? "system.event"),
        module: String(row.entity_type ?? "system"),
        time: formatDate(String(row.created_at ?? "")),
        ipAddress: String(row.ip_address ?? "unknown"),
        status: statusFromAudit(String(row.action ?? ""), details),
      };
    });

    const faqs: FaqItem[] = (documentRows as Array<Record<string, unknown>>)
      .filter((row) => String(row.source_type ?? "") === "faq")
      .map((row) => {
        const metadata = toRecord(row.metadata);
        return {
          id: String(row.id),
          question: String(metadata.question ?? row.title ?? "FAQ"),
          answer: String(row.content ?? metadata.answer ?? ""),
          category: String(row.category ?? "General FAQ"),
          language: mapLanguage(String(metadata.language ?? "English")),
          status: String(row.status ?? "") === "active" ? "Active" : "Disabled",
          tags: toArray<string>(metadata.tags),
          lastUpdated: formatDate(String(row.updated_at ?? "")),
        };
      });

    const products: Product[] = (productRows as Array<Record<string, unknown>>).map((row) => {
      const images = toArray<JsonRecord>(row.images);
      const variants = toArray<JsonRecord>(row.variants);
      const firstImage = images[0]?.src;
      const stockStatus =
        row.stock_status === "out_of_stock"
          ? "Out of Stock"
          : row.stock_status === "low_stock"
            ? "Low Stock"
            : "In Stock";

      const metadata = toRecord(row.metadata);
      return {
        id: String(row.id),
        name: String(row.title ?? "Untitled product"),
        image: typeof firstImage === "string" && firstImage ? firstImage : "/globe.svg",
        price: Number(row.price ?? variants[0]?.price ?? 0),
        stockStatus,
        tags: toArray<string>(row.tags),
        ragStatus: metadata.excludeFromBot ? "Excluded" : row.description ? "Included" : "Pending",
        lastSynced: formatDate(String(row.last_synced_at ?? row.updated_at ?? "")),
        description: String(row.description ?? ""),
      };
    });

    const websitePages = knowledgeSources
      .filter((source) => source.type === "Website")
      .map((source) => {
        const document = documentsById.get(source.id);
        const metadata = toRecord(document?.metadata);
        return ({
        id: source.id,
        url: String(metadata.url ?? `${env.SHOPIFY_STOREFRONT_BASE_URL.replace(/\/$/, "")}/knowledge/${source.id}`),
        pageType: "Page" as const,
        status: source.status,
        chunks: source.chunks,
        lastCrawled: source.lastUpdated,
      });
      });

    const crawlerLogs = websitePages.map((page) => ({
      id: page.id,
      url: page.url,
      pageType: page.pageType,
      status: page.status,
      chunks: page.chunks,
      lastCrawled: page.lastCrawled,
    }));

    const latestSync = products[0]?.lastSynced ?? "Never";
    const shopifySyncLogs = [
      {
        id: "shopify-latest",
        timestamp: latestSync,
        status: products.length > 0 ? "Success" : "Warning",
        summary:
          products.length > 0
            ? `Latest real Shopify product snapshot contains ${products.length} synced products.`
            : "No synced Shopify products were found in the admin database.",
        productsTouched: products.length,
      } as const,
    ];

    const notifications: NotificationItem[] = [
      ...failedAnswers.slice(0, 2).map((item) => ({
        id: `failed-${item.id}`,
        title: `Failed answer: ${item.reason}`,
        body: item.question,
        read: false,
        createdAt: item.date,
      })),
      ...knowledgeSources
        .filter((source) => source.status !== "Indexed")
        .slice(0, 2)
        .map((source) => ({
          id: `source-${source.id}`,
          title: `Source ${source.status.toLowerCase()}`,
          body: `${source.name} requires operator attention.`,
          read: false,
          createdAt: source.lastUpdated,
        })),
    ].slice(0, 5);

    const queryDates = conversations.map((conversation) => conversation.date.replace(" ", "T"));
    const queriesLast7Days = buildDailySeries(queryDates, 7);
    const queryVolume = buildWeeklySeries(
      conversations.map((conversation) => ({ created_at: conversation.date.replace(" ", "T"), value: 1 })),
      5,
    );
    const failedAnswerTrend = buildWeeklySeries(
      failedAnswers.map((item) => ({ created_at: item.date.replace(" ", "T"), value: 1 })),
      4,
    );
    const satisfactionTrend = buildWeeklySeries(
      conversations.map((conversation) => ({
        created_at: conversation.date.replace(" ", "T"),
        value: conversation.confidence,
      })),
      4,
    );

      const tokenUsage = conversations
        .filter((conversation) => conversation.tokensUsed > 0)
        .map((conversation) => ({
          id: `tok-${conversation.id}`,
          conversationId: conversation.id,
          question: conversation.question,
          tokensUsed: conversation.tokensUsed,
          estimatedCost: Number(((conversation.tokensUsed / 1000) * 0.5).toFixed(2)),
          model: String(modelSettingsValue.chatModel ?? "gpt-4.1-mini"),
          feature: "Chat",
          date: conversation.date.slice(0, 10),
        }));

    const tokenCostTrend = buildWeeklySeries(
      tokenUsage.map((item) => ({ created_at: `${item.date}T00:00:00`, value: Math.round(item.estimatedCost) })),
      4,
    );

    const intentDistribution = groupByLabel(
      (messageRows as Array<Record<string, unknown>>).map((row) => String(row.detected_intent ?? "Unknown")),
    );
    const languageDistribution = groupByLabel(conversations.map((conversation) => conversation.language));

    const topProductQuestions = products.slice(0, 5).map((product, index) => ({
      label: product.name,
      value:
        conversations.filter((conversation) =>
          conversation.question.toLowerCase().includes(product.name.toLowerCase().split(" ")[0]?.toLowerCase() ?? ""),
        ).length ||
        Math.max(1, products.length - index),
    }));

    const engagementBars = queriesLast7Days.slice(-4).map((point, index) => ({
      label: `Week ${index + 1}`,
      value: Math.min(100, point.value * 10),
    }));

    const sourceHealth: SourceHealth[] = [
      {
        label: "Knowledge sources",
        status: knowledgeSources.every((source) => source.status === "Indexed") ? ("Healthy" as const) : ("Pending" as const),
        detail: `${knowledgeSources.filter((source) => source.status === "Indexed").length} of ${knowledgeSources.length} sources are indexed.`,
      },
      {
        label: "Shopify sync",
        status: products.length > 0 ? ("Healthy" as const) : ("Failed" as const),
        detail:
          products.length > 0
            ? `${products.length} products are available for retrieval.`
            : "No live Shopify product snapshot is available in the admin database.",
      },
      {
        label: "Prompt governance",
        status: promptVersions.length > 0 ? ("Indexed" as const) : ("Failed" as const),
        detail: `${promptVersions.length} prompt versions are stored for review and rollback.`,
      },
      {
        label: "Conversation telemetry",
        status: conversations.length > 0 ? ("Healthy" as const) : ("Failed" as const),
        detail: `${conversations.length} recent answer traces are available for operator review.`,
      },
    ];

      const totalTokenCost = tokenUsage.reduce((sum, item) => sum + item.estimatedCost, 0);
      const averageLatency =
        conversations.length > 0
          ? conversations.reduce((sum, conversation) => sum + conversation.responseTime, 0) / conversations.length
          : 0;

      const dashboardMetrics = [
      {
        title: "Total Queries",
        value: formatCount(conversations.length),
        description: "Recent customer requests recorded in the production answer log.",
        trend: 0,
        icon: "MessagesSquare",
      },
      {
        title: "Successful Answers",
        value: formatCount(conversations.filter((conversation) => conversation.status === "Resolved").length),
        description: "Answers resolved without manual escalation.",
        trend: 0,
        icon: "BadgeCheck",
      },
      {
        title: "Failed Answers",
        value: formatCount(failedAnswers.length),
        description: "Answers that need recovery work, source repair, or escalation.",
        trend: 0,
        icon: "TriangleAlert",
      },
      {
        title: "Indexed Products",
        value: formatCount(products.filter((product) => product.ragStatus === "Included").length),
        description: "Shopify products currently available to the retrieval layer.",
        trend: 0,
        icon: "PackageSearch",
      },
      {
        title: "Knowledge Sources",
        value: formatCount(knowledgeSources.length),
        description: "Managed sources across documents, FAQs, websites, and Shopify.",
        trend: 0,
        icon: "DatabaseZap",
      },
      {
        title: "Avg Response Time",
        value: `${averageLatency.toFixed(1)}s`,
        description: "Observed answer latency across recent logged conversations.",
        trend: 0,
        icon: "TimerReset",
      },
      {
        title: "Token Usage",
        value: formatCount(tokenUsage.reduce((sum, item) => sum + item.tokensUsed, 0)),
        description: "Observed token usage from captured answer logs.",
        trend: 0,
        icon: "Coins",
      },
      {
        title: "Estimated Cost",
        value: formatMoney(totalTokenCost),
        description: "Approximate cost derived from captured token usage.",
        trend: 0,
        icon: "Wallet",
      },
    ];

      const snapshot = {
      currentUser,
      notifications,
      dashboardMetrics,
      products,
      websitePages,
      faqs,
      knowledgeSources,
      knowledgeChunks,
      conversations,
      failedAnswers,
      tickets,
      users,
      auditLogs,
      tokenUsage,
      promptVersions,
      crawlerLogs,
      shopifySyncLogs,
      sourceHealth,
      queriesLast7Days,
      topProductQuestions,
      languageDistribution,
      engagementBars,
      queryVolume,
      failedAnswerTrend,
      satisfactionTrend,
      tokenCostTrend,
      intentDistribution,
      tokenBudget: {
        monthlyBudget: Number(budgetSettings.monthlyBudget ?? 500),
        alertThreshold: Number(budgetSettings.alertThreshold ?? 80),
      },
      modelSettings: {
        chatModel: String(modelSettingsValue.chatModel ?? "gpt-4.1-mini"),
        embeddingModel: String(modelSettingsValue.embeddingModel ?? env.OPENAI_EMBEDDING_MODEL),
        temperature: Number(modelSettingsValue.temperature ?? 0.2),
        maxTokens: Number(modelSettingsValue.maxTokens ?? 850),
        similarityThreshold: Number(modelSettingsValue.similarityThreshold ?? 0.76),
        topK: Number(modelSettingsValue.topK ?? 6),
        enableCitations: Boolean(modelSettingsValue.enableCitations ?? true),
        enableFallbackAnswer: Boolean(modelSettingsValue.enableFallbackAnswer ?? true),
        enableStreaming: Boolean(modelSettingsValue.enableStreaming ?? true),
      },
      guardrails: {
        blockHarmfulContent: true,
        blockNonSnakitosAnswers: true,
        forceSourceCitation: true,
        refuseUnknownAnswers: true,
        detectPromptInjection: true,
        limitPersonalDataCollection: true,
        enableProfanityFilter: true,
        blockCompetitorComparisons: true,
        blockFakeDiscountClaims: true,
        blockSensitiveAdvice: true,
        blockedTopics: toArray<string>(guardrailsSetting.blockedClaims),
        promptInjectionExamples: [],
      },
      promptSettings: {
        prompt: String(activePrompt?.system_prompt ?? "No active production prompt is stored yet."),
        tone: "Professional",
        languageMode: "Auto-detect",
      },
      settings: {
        general: {
          brandName: String(generalSettings.brandName ?? "Snakitos"),
          supportEmail: String(generalSettings.supportEmail ?? "support@snakitos.com"),
          websiteUrl: String(generalSettings.websiteUrl ?? env.SHOPIFY_STOREFRONT_BASE_URL),
          defaultLanguage: mapLanguage(String(generalSettings.defaultLanguage ?? "English")),
        },
        apiKeys: {
          openAiKey: env.OPENAI_API_KEY ? "Configured on server" : "Missing",
          vectorDbKey: env.PINECONE_API_KEY ? "Configured on server" : "Missing",
          shopifyApiKey: env.SHOPIFY_ADMIN_API_ACCESS_TOKEN ? "Configured on server" : "Missing",
        },
        widgetAppearance: {
          chatbotName: String(widgetSettings.chatbotName ?? "Snakitos AI"),
          welcomeMessage: String(widgetSettings.welcomeMessage ?? "Assalam o Alaikum! Ask me about products, delivery, and support."),
          primaryColor: String(widgetSettings.primaryColor ?? "#4F46E5"),
          position: widgetSettings.position === "bottom-left" ? "bottom-left" : "bottom-right",
          enableLogo: Boolean(widgetSettings.enableLogo ?? true),
        },
        rateLimits: {
          requestsPerIp: Number(rateLimitSettings.requestsPerIp ?? 60),
          requestsPerUser: Number(rateLimitSettings.requestsPerUser ?? 100),
          cooldownTime: Number(rateLimitSettings.cooldownTime ?? 30),
          blockAbusiveUsers: Boolean(rateLimitSettings.blockAbusiveUsers ?? true),
        },
        notifications: {
          failedAnswers: Boolean(notificationSettings.failedAnswers ?? true),
          highTokenUsage: Boolean(notificationSettings.highTokenUsage ?? true),
          crawlerFailure: Boolean(notificationSettings.crawlerFailure ?? true),
          shopifySyncFailure: Boolean(notificationSettings.shopifySyncFailure ?? true),
        },
        backupExport: {
          lastBackupAt: formatDate(String(settingsMap.get("backup_export")?.lastBackupAt ?? "")),
        },
      },
      crawlerSettings: {
        websiteUrl: String(crawlerSettingsValue.websiteUrl ?? env.SHOPIFY_STOREFRONT_BASE_URL),
        depth: Number(crawlerSettingsValue.depth ?? 2),
        includePatterns: String(crawlerSettingsValue.includePatterns ?? "/products\n/pages\n/collections"),
        excludePatterns: String(crawlerSettingsValue.excludePatterns ?? "/cart\n/checkout\n/account"),
        autoDetectProductPages: Boolean(crawlerSettingsValue.autoDetectProductPages ?? true),
        autoDetectFaqPages: Boolean(crawlerSettingsValue.autoDetectFaqPages ?? true),
        autoDetectPolicyPages: Boolean(crawlerSettingsValue.autoDetectPolicyPages ?? true),
        respectRobots: Boolean(crawlerSettingsValue.respectRobots ?? true),
      },
      crawlerProgress: {
        totalPagesFound: websitePages.length,
        pagesIndexed: websitePages.filter((page) => page.status === "Indexed").length,
        failedPages: websitePages.filter((page) => page.status === "Failed").length,
        currentUrl: websitePages[0]?.url ?? "",
        progress: websitePages.length > 0 ? Math.round((websitePages.filter((page) => page.status === "Indexed").length / websitePages.length) * 100) : 0,
        running: Boolean(crawlerRuntimeValue.running ?? false),
      },
      shopifyConnection: {
        storeUrl: env.SHOPIFY_SHOP_DOMAIN ? `https://${env.SHOPIFY_SHOP_DOMAIN}` : env.SHOPIFY_STOREFRONT_BASE_URL,
        apiKey: env.SHOPIFY_ADMIN_API_ACCESS_TOKEN ? "Configured on server" : "Missing",
        connected: Boolean(env.SHOPIFY_SHOP_DOMAIN && env.SHOPIFY_ADMIN_API_ACCESS_TOKEN),
        lastSyncTime: latestSync,
      },
    } satisfies ControlCenterSnapshot;

      return NextResponse.json({ success: true, data: snapshot, snapshot });
    } catch (error) {
      console.error("Failed to build control-center snapshot", error);
      return errorResponse(
        "CONTROL_CENTER_LOAD_FAILED",
        "Unable to load control-center data.",
        500,
      );
    }
  });
}
