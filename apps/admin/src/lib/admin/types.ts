export type ChatIntent = "product" | "order" | "general";
export type ChatOutcome = "success" | "failure";
export type Tone = "friendly" | "professional";

export interface ChatRetrievedContextRecord {
  id: string;
  name: string;
  source: string;
  type: string;
  category: string;
  link?: string;
}

export interface DashboardMetric {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "neutral";
  helpText: string;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  userQuery: string;
  aiResponse: string;
  intent: ChatIntent;
  status: ChatOutcome;
  confidenceScore: number;
  responseTimeMs: number;
  createdAt: string;
  userId: string;
  sourceLabel: string;
  detailsSummary: string;
  retrievedContext: ChatRetrievedContextRecord[];
  metadata: Record<string, unknown>;
}

export interface FailedQuestionRecord {
  id: string;
  question: string;
  frequency: number;
  category: string;
  latestAttemptAt: string;
  suggestedAnswer: string;
  resolved: boolean;
}

export interface KnowledgeDocumentRecord {
  id: string;
  title: string;
  sourceType: "shopify" | "pdf" | "faq" | "manual";
  status: "indexed" | "queued" | "error";
  chunkCount: number;
  updatedAt: string;
  summary: string;
}

export interface SyncLogRecord {
  id: string;
  syncType: "products" | "orders" | "customers" | "webhook";
  status: "success" | "running" | "failed";
  recordsProcessed: number;
  startedAt: string;
  finishedAt: string | null;
  message: string;
}

export interface BotSettingsRecord {
  botName: string;
  welcomeMessage: string;
  fallbackMessage: string;
  tone: Tone;
  enableOrderTracking: boolean;
  enableProductRecommendations: boolean;
  supportEmail: string;
  supportWhatsapp: string;
}

export interface BehaviorAnalytics {
  totalUsers: number;
  returningUsers: number;
  averageSessionDurationSec: number;
  queriesPerSession: number;
}

export interface QueryAnalytics {
  topQuestions: Array<{ label: string; value: number }>;
  topProducts: Array<{ label: string; value: number }>;
  intents: Array<{ name: string; value: number }>;
}

export interface AiAnalytics {
  successRate: number;
  failureRate: number;
  averageResponseTimeMs: number;
  confidenceBuckets: Array<{ bucket: string; value: number }>;
}

export interface ConversionAnalytics {
  productClicks: number;
  addToCart: number;
  ordersInitiated: number;
}

export interface TimeSeriesPoint {
  label: string;
  chats: number;
  sales: number;
}

export interface AnalyticsSnapshot {
  behavior: BehaviorAnalytics;
  query: QueryAnalytics;
  ai: AiAnalytics;
  conversion: ConversionAnalytics;
  topFailedQueries: Array<{ label: string; value: number }>;
  failureCategories: Array<{ name: string; value: number }>;
  dailyVolume: TimeSeriesPoint[];
  hourlyUsage: Array<{ hour: string; chats: number }>;
}

export interface DashboardSnapshot {
  storeName: string;
  metrics: DashboardMetric[];
  alert: string | null;
  liveFeed: ChatMessageRecord[];
  syncLogs: SyncLogRecord[];
  failedQuestions: FailedQuestionRecord[];
  analytics: AnalyticsSnapshot;
}

export interface AdminProfile {
  id: string;
  email: string;
  fullName: string;
  role: "admin";
}
