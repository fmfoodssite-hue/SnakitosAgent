import type {
  AdminUser,
  ChatPlaygroundResponse,
  ControlCenterSnapshot,
  CrawlerSettings,
  FaqItem,
  GuardrailSettings,
  ModelSettings,
  Priority,
  PromptSettings,
  SettingsState,
  Ticket,
  UserRole,
} from "@/types";

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || "Request failed.");
  }

  return (payload.data ?? payload) as T;
}

/**
 * @deprecated Use /api/auth/login directly from the login page.
 * This stub exists only for type-compatibility with legacy callers.
 */
export async function login(..._args: unknown[]): Promise<AdminUser> {
  throw new Error("Use /api/auth/login — direct mock login is not supported in production.");
}

export async function getSnapshot(): Promise<ControlCenterSnapshot> {
  const response = await fetch("/api/admin/control-center", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to fetch control center snapshot.");
  }
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: ControlCenterSnapshot;
    snapshot?: ControlCenterSnapshot;
  };
  const snapshot = payload.snapshot ?? payload.data;
  if (!snapshot) {
    throw new Error("Invalid control center snapshot received.");
  }
  return snapshot;
}

export async function addKnowledgeSource(payload: {
  name: string;
  type: FaqItem["status"] extends never ? never : string;
  category?: string;
  language?: string;
  tags?: string[];
}) {
  const sourceTypeMap: Record<string, string> = {
    Website: "website",
    PDF: "pdf",
    Shopify: "shopify",
    FAQ: "faq",
    Manual: "manual",
  };

  await requestJson("/api/admin/knowledge", {
    method: "POST",
    body: JSON.stringify({
      title: payload.name,
      category: payload.category ?? "General FAQ",
      content: `${payload.name} source created from admin.`,
      source_type: sourceTypeMap[payload.type] ?? "manual",
      priority: "medium",
      status: "draft",
      metadata: {
        language: payload.language ?? "English",
        tags: payload.tags ?? [],
      },
    }),
  });
  return true;
}

export async function reindexKnowledgeSource(sourceId: string) {
  await requestJson("/api/admin/knowledge", {
    method: "PATCH",
    body: JSON.stringify({
      id: sourceId,
      status: "active",
    }),
  });
  return true;
}

export async function deleteKnowledgeSource(sourceId: string) {
  await requestJson(`/api/admin/knowledge?id=${encodeURIComponent(sourceId)}`, {
    method: "DELETE",
  });
  return true;
}

export async function uploadDocument(payload: {
  title: string;
  category: string;
  language: string;
  tags: string[];
  priority: Priority;
  active: boolean;
  fileNames: string[];
}) {
  await requestJson("/api/admin/knowledge", {
    method: "POST",
    body: JSON.stringify({
      title: payload.title,
      category: payload.category,
      content: `Uploaded files: ${payload.fileNames.join(", ")}`,
      source_type: "pdf",
      priority: payload.priority.toLowerCase(),
      status: payload.active ? "draft" : "archived",
      metadata: {
        language: payload.language,
        tags: payload.tags,
        fileNames: payload.fileNames,
      },
    }),
  });
  return true;
}

export async function startCrawler(settings: CrawlerSettings) {
  await requestJson("/api/admin/crawler/start", {
    method: "POST",
    body: JSON.stringify(settings),
  });
  return true;
}

export async function stopCrawler() {
  await requestJson("/api/admin/crawler/stop", {
    method: "POST",
  });
  return true;
}

export async function clearCrawlerResults() {
  await requestJson("/api/admin/crawler/clear", {
    method: "POST",
  });
  return true;
}

export async function recrawlPage(logId: string) {
  await requestJson(`/api/admin/crawler/${logId}`, {
    method: "POST",
  });
  return true;
}

export async function deleteCrawlerResult(logId: string) {
  await requestJson(`/api/admin/crawler/${logId}`, {
    method: "DELETE",
  });
  return true;
}

export async function connectShopify(storeUrl: string, apiKey: string) {
  await requestJson("/api/admin/shopify/connect", {
    method: "POST",
    body: JSON.stringify({ storeUrl, apiKey }),
  });
  return true;
}

export async function syncShopify() {
  await requestJson("/api/admin/shopify/sync", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return true;
}

export async function resyncProduct(productId: string) {
  await requestJson(`/api/admin/shopify/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "resync" }),
  });
  return true;
}

export async function toggleProductInBot(productId: string) {
  await requestJson(`/api/admin/shopify/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "toggle_bot" }),
  });
  return true;
}

export async function saveFaq(payload: Omit<FaqItem, "id" | "lastUpdated"> & { id?: string }) {
  await requestJson("/api/admin/faqs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return true;
}

export async function deleteFaq(faqId: string) {
  await requestJson(`/api/admin/faqs/${faqId}`, {
    method: "DELETE",
  });
  return true;
}

export async function toggleFaq(faqId: string) {
  await requestJson(`/api/admin/faqs/${faqId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "toggle" }),
  });
  return true;
}

export async function deleteChunk(chunkId: string) {
  await requestJson(`/api/admin/chunks/${chunkId}`, {
    method: "DELETE",
  });
  return true;
}

export async function reembedChunk(chunkId: string) {
  await requestJson(`/api/admin/chunks/${chunkId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "reembed" }),
  });
  return true;
}

export async function sendPlaygroundMessage(message: string): Promise<ChatPlaygroundResponse> {
  const payload = await requestJson<{
    generated_answer: string;
    source_names: string[];
    confidence_score: number;
    latency_ms: number;
    total_tokens: number;
    model: string;
    retrieved_chunks: Array<unknown>;
    language?: string;
  }>("/api/admin/playground/test", {
    method: "POST",
    body: JSON.stringify({
      query: message,
      save_trace: true,
    }),
  });

  return {
    message: payload.generated_answer,
    confidence: Math.round(payload.confidence_score * 100),
    responseTime: Number((payload.latency_ms / 1000).toFixed(1)),
    tokenUsage: payload.total_tokens,
    model: payload.model,
    chunksUsed: payload.retrieved_chunks.length,
    languageDetected:
      payload.language === "Urdu"
        ? "Urdu"
        : payload.language === "Roman Urdu"
          ? "Roman Urdu"
          : "English",
    retrievalMethod: "database + model-grounded",
    retrievedSources: payload.source_names,
  };
}

export async function addFailedAnswerFromPlayground(question: string, answer: string) {
  await requestJson("/api/admin/tickets", {
    method: "POST",
    body: JSON.stringify({
      title: "Playground review",
      customer_question: question,
      bot_answer: answer,
      priority: "Medium",
      status: "Open",
      recommended_reply: "",
      resolution_notes: "Created from playground review.",
    }),
  });
  return true;
}

export async function savePromptSettings(settings: PromptSettings) {
  await requestJson("/api/admin/prompt-manager", {
    method: "POST",
    body: JSON.stringify(settings),
  });
  return true;
}

export async function rollbackPrompt(versionId: string) {
  await requestJson("/api/admin/prompts", {
    method: "PATCH",
    body: JSON.stringify({ id: versionId, activate: true }),
  });
  return true;
}

export async function duplicatePrompt(versionId: string) {
  return rollbackPrompt(versionId);
}

export async function markConversationReviewed(conversationId: string) {
  await requestJson("/api/admin/chats", {
    method: "PATCH",
    body: JSON.stringify({ messageId: conversationId }),
  });
  return true;
}

export async function addConversationNote(conversationId: string, note: string) {
  await requestJson(`/api/admin/chats/${conversationId}/notes`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
  return true;
}

export async function ignoreFailedAnswer(answerId: string) {
  await requestJson(`/api/admin/failed-answers/${answerId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "ignore" }),
  });
  return true;
}

export async function fixFailedAnswer(answerId: string) {
  await requestJson(`/api/admin/failed-answers/${answerId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "fix" }),
  });
  return true;
}

export async function saveBudgetSettings(monthlyBudget: number, alertThreshold: number) {
  await requestJson("/api/admin/settings", {
    method: "POST",
    body: JSON.stringify({
      key: "token_budget",
      value: { monthlyBudget, alertThreshold },
      description: "Token budget settings",
    }),
  });
  return true;
}

export async function saveTicket(ticket: Ticket) {
  await requestJson("/api/admin/tickets", {
    method: "PATCH",
    body: JSON.stringify({
      id: ticket.id,
      status: ticket.status,
      priority: ticket.priority,
      assignedTo: ticket.assignedTo,
      adminReply: ticket.adminReply,
      internalNotes: ticket.internalNotes,
    }),
  });
  return true;
}

export async function resolveTicket(ticketId: string) {
  await requestJson("/api/admin/tickets", {
    method: "PATCH",
    body: JSON.stringify({
      id: ticketId,
      status: "Resolved",
    }),
  });
  return true;
}

export async function saveModelSettings(settings: ModelSettings) {
  await requestJson("/api/admin/settings", {
    method: "POST",
    body: JSON.stringify({
      key: "model_settings",
      value: settings,
      description: "Model settings",
    }),
  });
  return true;
}

export async function saveGuardrails(guardrails: GuardrailSettings) {
  await requestJson("/api/admin/settings", {
    method: "POST",
    body: JSON.stringify({
      key: "guardrails",
      value: guardrails,
      description: "Guardrail settings",
    }),
  });
  return true;
}

export async function inviteUser(payload: { name: string; email: string; role: UserRole }) {
  await requestJson("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return true;
}

export async function updateUserRole(userId: string, role: UserRole) {
  await requestJson(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "role", role }),
  });
  return true;
}

export async function disableUser(userId: string) {
  await requestJson(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "disable" }),
  });
  return true;
}

export async function deleteUser(userId: string) {
  await requestJson(`/api/admin/users/${userId}`, {
    method: "DELETE",
  });
  return true;
}

interface AuditLogExportRow {
  id: string;
  admin_id?: string;
  adminId?: string;
  action: string;
  entity_type?: string;
  entityType?: string;
  ip_address?: string;
  ipAddress?: string;
  created_at?: string;
  timestamp?: string;
  details?: Record<string, unknown>;
}

export async function exportAuditLogs(): Promise<boolean> {
  const data = await requestJson<{ rows: AuditLogExportRow[]; exported_at: string; exported_by: string }>("/api/admin/audit-logs", {
    method: "POST",
    body: JSON.stringify({ action: "export" }),
  });

  if (data && data.rows) {
    const headers = ["ID", "Admin ID", "Action", "Entity Type", "IP Address", "Created At", "Details"];
    const csvRows = [headers.join(",")];

    for (const row of data.rows) {
      const detailsStr = JSON.stringify(row.details || {}).replace(/"/g, '""');
      const csvRow = [
        `"${row.id}"`,
        `"${row.admin_id || row.adminId || ""}"`,
        `"${row.action}"`,
        `"${row.entity_type || row.entityType || ""}"`,
        `"${row.ip_address || row.ipAddress || ""}"`,
        `"${row.created_at || row.timestamp || ""}"`,
        `"${detailsStr}"`,
      ];
      csvRows.push(csvRow.join(","));
    }

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => encodeURIComponent(e)).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `audit_logs_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  return true;
}

export async function saveSettings(settings: SettingsState) {
  const settingEntries = [
    ["general", settings.general, "General settings"],
    ["api_keys", settings.apiKeys, "API key placeholders"],
    ["widget", settings.widgetAppearance, "Widget appearance"],
    ["rate_limits", settings.rateLimits, "Rate limit settings"],
    ["notifications", settings.notifications, "Notification settings"],
    ["backup_export", settings.backupExport, "Backup metadata"],
  ] as const;

  await Promise.all(
    settingEntries.map(([key, value, description]) =>
      requestJson("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ key, value, description }),
      }),
    ),
  );
  return true;
}

export async function createBackup() {
  await requestJson("/api/admin/settings", {
    method: "POST",
    body: JSON.stringify({
      key: "backup_export",
      value: { lastBackupAt: new Date().toISOString() },
      description: "Backup metadata",
    }),
  });
  return true;
}
