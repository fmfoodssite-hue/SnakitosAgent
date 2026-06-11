import { createMockSnapshot } from "@/lib/mock-data";
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
  PromptVersion,
  SettingsState,
  Ticket,
  UserRole,
} from "@/types";

const db = structuredClone(createMockSnapshot());

function delay<T>(result: T, ms = 450): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(result)), ms));
}

function now() {
  const date = new Date();
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function addAudit(action: string, module: string, status: "Success" | "Warning" | "Error" = "Success") {
  db.auditLogs.unshift({
    id: id("aud"),
    admin: db.currentUser.name,
    action,
    module,
    time: now(),
    ipAddress: "182.184.14.18",
    status,
  });
}

export async function getSnapshot(): Promise<ControlCenterSnapshot> {
  return delay(db, 250);
}

export async function login(email: string, password: string): Promise<AdminUser> {
  const user = db.users.find((item) => item.email.toLowerCase() === email.toLowerCase());
  if (!user || !password.trim()) {
    throw new Error("Invalid email or password.");
  }
  db.currentUser = user;
  return delay(user, 500);
}

export async function addKnowledgeSource(payload: {
  name: string;
  type: FaqItem["status"] extends never ? never : string;
  category?: string;
  language?: string;
  tags?: string[];
}) {
  db.knowledgeSources.unshift({
    id: id("src"),
    name: payload.name,
    type: payload.type as ControlCenterSnapshot["knowledgeSources"][number]["type"],
    status: "Pending",
    chunks: 6,
    lastUpdated: now(),
    addedBy: db.currentUser.name,
    sampleChunks: [`${payload.name} staged for indexing.`, `Category: ${payload.category ?? "General"}.`],
    relatedConversationIds: [],
  });
  addAudit(`Added knowledge source ${payload.name}`, "Knowledge Base");
  return delay(true);
}

export async function reindexKnowledgeSource(sourceId: string) {
  db.knowledgeSources = db.knowledgeSources.map((source) =>
    source.id === sourceId ? { ...source, status: "Indexed", lastUpdated: now(), chunks: Math.max(source.chunks, 8) } : source,
  );
  addAudit("Re-indexed knowledge source", "Knowledge Base");
  return delay(true, 700);
}

export async function deleteKnowledgeSource(sourceId: string) {
  db.knowledgeSources = db.knowledgeSources.filter((source) => source.id !== sourceId);
  addAudit("Deleted knowledge source", "Knowledge Base", "Warning");
  return delay(true);
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
  db.knowledgeSources.unshift({
    id: id("src"),
    name: payload.title,
    type: "PDF",
    status: payload.active ? "Pending" : "Failed",
    chunks: payload.fileNames.length * 4,
    lastUpdated: now(),
    addedBy: db.currentUser.name,
    sampleChunks: [`Uploaded files: ${payload.fileNames.join(", ")}`, `Priority: ${payload.priority}`],
    relatedConversationIds: [],
  });
  addAudit(`Uploaded ${payload.fileNames.length} document(s)`, "Upload Documents");
  return delay(true, 900);
}

export async function startCrawler(settings: CrawlerSettings) {
  db.crawlerSettings = settings;
  db.crawlerProgress = {
    totalPagesFound: 38,
    pagesIndexed: 35,
    failedPages: 1,
    currentUrl: "https://snakitos.com/pages/snack-club",
    progress: 94,
    running: true,
  };
  db.crawlerLogs.unshift({
    id: id("crw"),
    url: `${settings.websiteUrl}/pages/snack-club`,
    pageType: "Page",
    status: "Pending",
    chunks: 2,
    lastCrawled: now(),
  });
  addAudit("Started website crawl", "Website Crawler");
  return delay(true, 800);
}

export async function stopCrawler() {
  db.crawlerProgress.running = false;
  addAudit("Stopped website crawl", "Website Crawler", "Warning");
  return delay(true);
}

export async function clearCrawlerResults() {
  db.crawlerLogs = [];
  db.websitePages = [];
  db.crawlerProgress = {
    totalPagesFound: 0,
    pagesIndexed: 0,
    failedPages: 0,
    currentUrl: "",
    progress: 0,
    running: false,
  };
  addAudit("Cleared crawler results", "Website Crawler", "Warning");
  return delay(true);
}

export async function recrawlPage(logId: string) {
  db.crawlerLogs = db.crawlerLogs.map((log) =>
    log.id === logId ? { ...log, status: "Indexed", lastCrawled: now(), chunks: Math.max(log.chunks, 3) } : log,
  );
  addAudit("Re-crawled website page", "Website Crawler");
  return delay(true, 700);
}

export async function deleteCrawlerResult(logId: string) {
  db.crawlerLogs = db.crawlerLogs.filter((log) => log.id !== logId);
  addAudit("Deleted crawler result", "Website Crawler", "Warning");
  return delay(true);
}

export async function connectShopify(storeUrl: string, apiKey: string) {
  db.shopifyConnection = { storeUrl, apiKey, connected: true, lastSyncTime: db.shopifyConnection.lastSyncTime };
  addAudit("Connected Shopify store", "Shopify");
  return delay(true);
}

export async function syncShopify() {
  db.shopifyConnection.lastSyncTime = now();
  db.products = db.products.map((product, index) => ({
    ...product,
    lastSynced: now(),
    ragStatus: index === 7 ? "Excluded" : "Included",
  }));
  db.shopifySyncLogs.unshift({
    id: id("syn"),
    timestamp: now(),
    status: "Success",
    summary: "Manual sync completed from dashboard.",
    productsTouched: db.products.length,
  });
  addAudit("Synced Shopify catalog", "Shopify");
  return delay(true, 850);
}

export async function resyncProduct(productId: string) {
  db.products = db.products.map((product) => (product.id === productId ? { ...product, lastSynced: now(), ragStatus: "Included" } : product));
  addAudit("Re-synced single product", "Shopify");
  return delay(true, 650);
}

export async function toggleProductInBot(productId: string) {
  db.products = db.products.map((product) =>
    product.id === productId
      ? { ...product, ragStatus: product.ragStatus === "Excluded" ? "Included" : "Excluded" }
      : product,
  );
  addAudit("Updated product bot availability", "Shopify");
  return delay(true);
}

export async function saveFaq(payload: Omit<FaqItem, "id" | "lastUpdated"> & { id?: string }) {
  const faq: FaqItem = {
    id: payload.id ?? id("faq"),
    question: payload.question,
    answer: payload.answer,
    category: payload.category,
    language: payload.language,
    status: payload.status,
    tags: payload.tags,
    lastUpdated: now(),
  };
  db.faqs = payload.id ? db.faqs.map((item) => (item.id === payload.id ? faq : item)) : [faq, ...db.faqs];
  addAudit(payload.id ? "Updated FAQ" : "Created FAQ", "FAQs");
  return delay(true);
}

export async function deleteFaq(faqId: string) {
  db.faqs = db.faqs.filter((faq) => faq.id !== faqId);
  addAudit("Deleted FAQ", "FAQs", "Warning");
  return delay(true);
}

export async function toggleFaq(faqId: string) {
  db.faqs = db.faqs.map((faq) =>
    faq.id === faqId ? { ...faq, status: faq.status === "Active" ? "Disabled" : "Active", lastUpdated: now() } : faq,
  );
  addAudit("Toggled FAQ status", "FAQs");
  return delay(true);
}

export async function deleteChunk(chunkId: string) {
  db.knowledgeChunks = db.knowledgeChunks.filter((chunk) => chunk.id !== chunkId);
  addAudit("Deleted chunk", "Chunks", "Warning");
  return delay(true);
}

export async function reembedChunk(chunkId: string) {
  db.knowledgeChunks = db.knowledgeChunks.map((chunk) =>
    chunk.id === chunkId ? { ...chunk, embeddingStatus: "Indexed", relevanceScore: 0.95, lastUpdated: now() } : chunk,
  );
  addAudit("Re-embedded chunk", "Chunks");
  return delay(true, 700);
}

export async function sendPlaygroundMessage(message: string): Promise<ChatPlaygroundResponse> {
  const normalized = message.toLowerCase();
  let response = "Snakitos AI can help with products, delivery, policies, offers, and support contact once the answer is supported by approved knowledge.";
  let sources = ["Support FAQ Master Sheet"];

  if (normalized.includes("spicy")) {
    response = "Snakitos currently offers Spicy Chips as a strong spicy recommendation, and they are also available in family-size pack guidance from the product catalog.";
    sources = ["Snakitos Product Catalog"];
  } else if (normalized.includes("delivery")) {
    response = "Delivery timelines vary by city and courier lane. The approved shipping policy is the best source for exact expectations and support escalation when needed.";
    sources = ["Shipping & Delivery Policies"];
  } else if (normalized.includes("discount")) {
    response = "I can only confirm discounts that are currently approved in the offers knowledge source. Right now, live popcorn discounts are not verified.";
    sources = ["Offer Calendar June 2026"];
  } else if (normalized.includes("roman urdu")) {
    response = "Ji haan, Snakitos AI Roman Urdu support karta hai aur products, delivery, aur support related sawalat ka jawab de sakta hai jab relevant knowledge indexed ho.";
    sources = ["Support FAQ Master Sheet"];
  }

  return delay(
    {
      message: response,
      confidence: normalized.includes("discount") ? 61 : 94,
      responseTime: normalized.includes("discount") ? 2 : 1.2,
      tokenUsage: normalized.includes("discount") ? 840 : 610,
      model: "gpt-4.1-mini",
      chunksUsed: sources.length + 1,
      languageDetected: normalized.includes("roman urdu") ? "Roman Urdu" : "English",
      retrievalMethod: "semantic + keyword hybrid",
      retrievedSources: sources,
    },
    750,
  );
}

export async function addFailedAnswerFromPlayground(question: string, answer: string) {
  db.failedAnswers.unshift({
    id: id("fal"),
    question,
    reason: "Low confidence",
    confidence: 49,
    language: "English",
    date: now(),
    priority: "Medium",
    suggestedFix: "Review retrieved chunks and add stronger approved guidance.",
    status: "Unresolved",
  });
  db.tickets.unshift({
    id: id("tic"),
    userQuestion: question,
    botAnswer: answer,
    status: "Open",
    priority: "Medium",
    assignedTo: db.currentUser.name,
    createdAt: now(),
    internalNotes: "Created from playground review.",
    adminReply: "",
  });
  addAudit("Marked playground answer as wrong", "Chat Playground", "Warning");
  return delay(true);
}

export async function savePromptSettings(settings: PromptSettings) {
  db.promptSettings = settings;
  const latestVersion = `v2.${db.promptVersions.length + 8}`;
  const version: PromptVersion = {
    id: id("prm"),
    version: latestVersion,
    prompt: settings.prompt,
    tone: settings.tone,
    languageMode: settings.languageMode,
    updatedBy: db.currentUser.name,
    date: now(),
  };
  db.promptVersions.unshift(version);
  addAudit("Saved prompt version", "Prompt Manager");
  return delay(true);
}

export async function rollbackPrompt(versionId: string) {
  const target = db.promptVersions.find((item) => item.id === versionId);
  if (target) {
    db.promptSettings = {
      prompt: target.prompt,
      tone: target.tone,
      languageMode: target.languageMode,
    };
    addAudit(`Rolled back prompt to ${target.version}`, "Prompt Manager", "Warning");
  }
  return delay(true);
}

export async function duplicatePrompt(versionId: string) {
  const target = db.promptVersions.find((item) => item.id === versionId);
  if (target) {
    db.promptVersions.unshift({ ...target, id: id("prm"), version: `${target.version}-copy`, date: now() });
    addAudit(`Duplicated prompt ${target.version}`, "Prompt Manager");
  }
  return delay(true);
}

export async function markConversationReviewed(conversationId: string) {
  db.conversations = db.conversations.map((item) => (item.id === conversationId ? { ...item, reviewed: true, status: "Resolved" } : item));
  addAudit("Marked conversation reviewed", "Conversations");
  return delay(true);
}

export async function addConversationNote(conversationId: string, note: string) {
  db.conversations = db.conversations.map((item) =>
    item.id === conversationId ? { ...item, notes: [...(item.notes ?? []), note] } : item,
  );
  addAudit("Added conversation note", "Conversations");
  return delay(true);
}

export async function ignoreFailedAnswer(answerId: string) {
  db.failedAnswers = db.failedAnswers.map((item) => (item.id === answerId ? { ...item, status: "Ignored" } : item));
  addAudit("Ignored failed answer", "Failed Answers", "Warning");
  return delay(true);
}

export async function fixFailedAnswer(answerId: string) {
  db.failedAnswers = db.failedAnswers.map((item) => (item.id === answerId ? { ...item, status: "Fixed" } : item));
  addAudit("Marked failed answer fixed", "Failed Answers");
  return delay(true);
}

export async function saveBudgetSettings(monthlyBudget: number, alertThreshold: number) {
  db.tokenBudget = { monthlyBudget, alertThreshold };
  addAudit("Updated token budget settings", "Token Usage");
  return delay(true);
}

export async function saveTicket(ticket: Ticket) {
  db.tickets = db.tickets.map((item) => (item.id === ticket.id ? { ...ticket } : item));
  addAudit("Updated support ticket", "Tickets");
  return delay(true);
}

export async function resolveTicket(ticketId: string) {
  db.tickets = db.tickets.map((item) => (item.id === ticketId ? { ...item, status: "Resolved" } : item));
  addAudit("Resolved support ticket", "Tickets");
  return delay(true);
}

export async function saveModelSettings(settings: ModelSettings) {
  db.modelSettings = settings;
  addAudit("Updated model settings", "Model Settings");
  return delay(true);
}

export async function saveGuardrails(guardrails: GuardrailSettings) {
  db.guardrails = guardrails;
  addAudit("Updated guardrails", "Guardrails");
  return delay(true);
}

export async function inviteUser(payload: { name: string; email: string; role: UserRole }) {
  db.users.unshift({
    id: id("usr"),
    name: payload.name,
    email: payload.email,
    role: payload.role,
    status: "Invited",
    lastActive: "Pending invite",
    avatar: payload.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
  });
  addAudit(`Invited ${payload.name}`, "Users");
  return delay(true);
}

export async function updateUserRole(userId: string, role: UserRole) {
  db.users = db.users.map((user) => (user.id === userId ? { ...user, role } : user));
  addAudit("Updated user role", "Users");
  return delay(true);
}

export async function disableUser(userId: string) {
  db.users = db.users.map((user) => (user.id === userId ? { ...user, status: "Disabled" } : user));
  addAudit("Disabled user", "Users", "Warning");
  return delay(true);
}

export async function deleteUser(userId: string) {
  db.users = db.users.filter((user) => user.id !== userId);
  addAudit("Deleted user", "Users", "Warning");
  return delay(true);
}

export async function exportAuditLogs() {
  addAudit("Exported audit logs", "Audit Logs");
  return delay(true);
}

export async function saveSettings(settings: SettingsState) {
  db.settings = settings;
  addAudit("Saved app settings", "Settings");
  return delay(true);
}

export async function createBackup() {
  db.settings.backupExport.lastBackupAt = now();
  addAudit("Created backup export", "Settings");
  return delay(true, 900);
}
