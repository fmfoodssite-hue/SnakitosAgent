import type { AdminRole } from "@/lib/types";

export type ModulePermission = {
  key: string;
  label: string;
  category: string;
  description: string;
  sortOrder: number;
};

export const MODULE_PERMISSIONS = [
  { key: "dashboard.view", label: "Dashboard", category: "Dashboard", description: "View dashboard metrics and overview.", sortOrder: 10 },
  { key: "knowledge.view", label: "Knowledge Base", category: "RAG Management", description: "View knowledge sources and documents.", sortOrder: 20 },
  { key: "uploads.view", label: "Upload Documents", category: "RAG Management", description: "Upload and review training documents.", sortOrder: 30 },
  { key: "crawler.view", label: "Website Crawler", category: "RAG Management", description: "Run and monitor website crawling.", sortOrder: 40 },
  { key: "shopify.view", label: "Shopify Sync", category: "RAG Management", description: "View and manage Shopify product sync.", sortOrder: 50 },
  { key: "faqs.view", label: "FAQs", category: "RAG Management", description: "Manage approved FAQ knowledge.", sortOrder: 60 },
  { key: "chunks.view", label: "Chunks", category: "RAG Management", description: "Inspect retrieved knowledge chunks.", sortOrder: 70 },
  { key: "playground.view", label: "Chat Playground", category: "AI Control", description: "Test chatbot answers and retrieval behavior.", sortOrder: 80 },
  { key: "prompts.view", label: "Prompt Manager", category: "AI Control", description: "View and manage prompt versions.", sortOrder: 90 },
  { key: "model_settings.view", label: "Model Settings", category: "AI Control", description: "View and update model configuration.", sortOrder: 100 },
  { key: "guardrails.view", label: "Guardrails", category: "AI Control", description: "View safety and policy controls.", sortOrder: 110 },
  { key: "conversations.view", label: "Conversations", category: "Monitoring", description: "Review user conversations and responses.", sortOrder: 120 },
  { key: "failed_answers.view", label: "Failed Answers", category: "Monitoring", description: "Review failed or low-confidence answers.", sortOrder: 130 },
  { key: "analytics.view", label: "Analytics", category: "Monitoring", description: "View analytics and trends.", sortOrder: 140 },
  { key: "token_usage.view", label: "Token Usage", category: "Monitoring", description: "View token usage and cost data.", sortOrder: 150 },
  { key: "tickets.view", label: "Tickets", category: "Monitoring", description: "View and manage support tickets.", sortOrder: 160 },
  { key: "users.manage", label: "Users & Roles", category: "Admin", description: "Create users and manage roles or permissions.", sortOrder: 170 },
  { key: "audit.view", label: "Audit Logs", category: "Admin", description: "View admin activity logs.", sortOrder: 180 },
  { key: "settings.view", label: "Settings", category: "Admin", description: "View and manage dashboard settings.", sortOrder: 190 },
  { key: "profile.view", label: "Profile", category: "Account", description: "View and update the signed-in user's profile.", sortOrder: 200 },
] as const satisfies readonly ModulePermission[];

export type ModulePermissionKey = (typeof MODULE_PERMISSIONS)[number]["key"];

export const ALL_MODULE_PERMISSION_KEYS = MODULE_PERMISSIONS.map((permission) => permission.key);

export const ROLE_DEFAULT_PERMISSIONS: Record<AdminRole, ModulePermissionKey[]> = {
  owner: [...ALL_MODULE_PERMISSION_KEYS],
  admin: ALL_MODULE_PERMISSION_KEYS.filter((permission) => permission !== "audit.view"),
  content_manager: [
    "dashboard.view",
    "knowledge.view",
    "uploads.view",
    "crawler.view",
    "shopify.view",
    "faqs.view",
    "chunks.view",
    "playground.view",
    "prompts.view",
    "model_settings.view",
    "guardrails.view",
    "analytics.view",
    "token_usage.view",
    "profile.view",
  ],
  support_agent: [
    "dashboard.view",
    "playground.view",
    "conversations.view",
    "failed_answers.view",
    "tickets.view",
    "faqs.view",
    "profile.view",
  ],
  viewer: [
    "dashboard.view",
    "knowledge.view",
    "conversations.view",
    "analytics.view",
    "token_usage.view",
    "profile.view",
  ],
};

const ROUTE_PERMISSION_RULES: Array<{ pattern: RegExp; permission: ModulePermissionKey }> = [
  { pattern: /^\/$/, permission: "dashboard.view" },
  { pattern: /^\/dashboard(?:\/|$)/, permission: "dashboard.view" },
  { pattern: /^\/knowledge-base(?:\/|$)/, permission: "knowledge.view" },
  { pattern: /^\/knowledge\/upload(?:\/|$)/, permission: "uploads.view" },
  { pattern: /^\/uploads(?:\/|$)/, permission: "uploads.view" },
  { pattern: /^\/knowledge\/crawler(?:\/|$)/, permission: "crawler.view" },
  { pattern: /^\/shopify(?:\/|$)/, permission: "shopify.view" },
  { pattern: /^\/shopify-sync(?:\/|$)/, permission: "shopify.view" },
  { pattern: /^\/knowledge\/faqs(?:\/|$)/, permission: "faqs.view" },
  { pattern: /^\/knowledge\/chunks(?:\/|$)/, permission: "chunks.view" },
  { pattern: /^\/knowledge(?:\/|$)/, permission: "knowledge.view" },
  { pattern: /^\/playground(?:\/|$)/, permission: "playground.view" },
  { pattern: /^\/prompts(?:\/|$)/, permission: "prompts.view" },
  { pattern: /^\/prompt-control(?:\/|$)/, permission: "prompts.view" },
  { pattern: /^\/model-settings(?:\/|$)/, permission: "model_settings.view" },
  { pattern: /^\/guardrails(?:\/|$)/, permission: "guardrails.view" },
  { pattern: /^\/conversations(?:\/|$)/, permission: "conversations.view" },
  { pattern: /^\/failed-answers(?:\/|$)/, permission: "failed_answers.view" },
  { pattern: /^\/analytics(?:\/|$)/, permission: "analytics.view" },
  { pattern: /^\/token-usage(?:\/|$)/, permission: "token_usage.view" },
  { pattern: /^\/tickets(?:\/|$)/, permission: "tickets.view" },
  { pattern: /^\/handoffs(?:\/|$)/, permission: "tickets.view" },
  { pattern: /^\/users(?:\/|$)/, permission: "users.manage" },
  { pattern: /^\/audit-logs(?:\/|$)/, permission: "audit.view" },
  { pattern: /^\/settings(?:\/|$)/, permission: "settings.view" },
  { pattern: /^\/profile(?:\/|$)/, permission: "profile.view" },
];

export function getDefaultPermissionsForRole(role: AdminRole) {
  return ROLE_DEFAULT_PERMISSIONS[role] ?? ROLE_DEFAULT_PERMISSIONS.viewer;
}

export function normalizePermissionKeys(permissions: unknown) {
  const allowed = new Set<string>(ALL_MODULE_PERMISSION_KEYS);
  if (!Array.isArray(permissions)) return [];
  return [...new Set(permissions.filter((permission): permission is string => typeof permission === "string" && allowed.has(permission)))];
}

export function hasModulePermission(permissions: readonly string[] | undefined, permission: string) {
  return Boolean(permissions?.includes(permission));
}

export function getPermissionForPathname(pathname: string) {
  return ROUTE_PERMISSION_RULES.find((rule) => rule.pattern.test(pathname))?.permission ?? null;
}

