export type UserRole = "Owner" | "Admin" | "Support Agent" | "Content Manager" | "Viewer";

export type SourceType = "PDF" | "Website" | "Shopify" | "FAQ" | "Manual" | "DOCX" | "TXT" | "CSV" | "JSON";
export type IndexStatus = "Indexed" | "Pending" | "Failed";
export type StockStatus = "In Stock" | "Low Stock" | "Out of Stock";
export type RagStatus = "Included" | "Excluded" | "Pending";
export type ConversationStatus = "Resolved" | "Needs Review" | "Escalated";
export type Language = "English" | "Urdu" | "Roman Urdu" | "Auto";
export type TicketStatus = "Open" | "Pending" | "Resolved" | "Closed";
export type Priority = "High" | "Medium" | "Low";
export type UserStatus = "Active" | "Invited" | "Disabled";
export type Severity = "Critical" | "High" | "Medium" | "Low";
export type FailedAnswerReason =
  | "No relevant source found"
  | "Low confidence"
  | "Missing product info"
  | "Policy not indexed"
  | "Prompt injection detected"
  | "Outdated knowledge";
export type PageType = "Product" | "Collection" | "FAQ" | "Policy" | "Blog" | "Page";
export type ChartPoint = { label: string; value: number; [key: string]: number | string };

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastActive: string;
  avatar: string;
};

export type Product = {
  id: string;
  name: string;
  image: string;
  price: number;
  stockStatus: StockStatus;
  tags: string[];
  ragStatus: RagStatus;
  lastSynced: string;
  description: string;
};

export type WebsitePage = {
  id: string;
  url: string;
  pageType: PageType;
  status: IndexStatus;
  chunks: number;
  lastCrawled: string;
};

export type KnowledgeSource = {
  id: string;
  name: string;
  type: SourceType;
  status: IndexStatus;
  chunks: number;
  lastUpdated: string;
  addedBy: string;
  sampleChunks: string[];
  relatedConversationIds: string[];
};

export type KnowledgeChunk = {
  id: string;
  source: string;
  sourceId: string;
  textPreview: string;
  fullText: string;
  tokens: number;
  embeddingStatus: IndexStatus;
  relevanceScore: number;
  lastUpdated: string;
  exampleQuestions: string[];
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  category: string;
  language: Language;
  status: "Active" | "Disabled";
  tags: string[];
  lastUpdated: string;
};

export type Conversation = {
  id: string;
  userId: string;
  question: string;
  answer: string;
  status: ConversationStatus;
  language: Language;
  satisfaction: number;
  confidence: number;
  date: string;
  sources: string[];
  tokensUsed: number;
  responseTime: number;
  feedback: string;
  reviewed?: boolean;
  notes?: string[];
};

export type FailedAnswer = {
  id: string;
  question: string;
  reason: FailedAnswerReason;
  confidence: number;
  language: Language;
  date: string;
  priority: Priority;
  suggestedFix: string;
  status: "Unresolved" | "Ignored" | "Fixed";
};

export type Ticket = {
  id: string;
  userQuestion: string;
  botAnswer: string;
  status: TicketStatus;
  priority: Priority;
  assignedTo: string;
  createdAt: string;
  internalNotes: string;
  adminReply: string;
};

export type PromptVersion = {
  id: string;
  version: string;
  prompt: string;
  tone: "Friendly" | "Professional" | "Sales-focused" | "Support-focused" | "Roman Urdu";
  languageMode: Exclude<Language, "Auto"> | "Auto-detect";
  updatedBy: string;
  date: string;
};

export type AuditLog = {
  id: string;
  admin: string;
  action: string;
  module: string;
  time: string;
  ipAddress: string;
  status: "Success" | "Warning" | "Error";
};

export type TokenUsageRecord = {
  id: string;
  conversationId: string;
  question: string;
  tokensUsed: number;
  estimatedCost: number;
  model: string;
  feature: string;
  date: string;
};

export type CrawlerLog = {
  id: string;
  url: string;
  pageType: PageType;
  status: IndexStatus;
  chunks: number;
  lastCrawled: string;
};

export type ShopifySyncLog = {
  id: string;
  timestamp: string;
  status: "Success" | "Warning" | "Error";
  summary: string;
  productsTouched: number;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export type SourceHealth = {
  label: string;
  status: "Healthy" | "Indexed" | "Pending" | "Failed";
  detail: string;
};

export type DashboardMetric = {
  title: string;
  value: string;
  description: string;
  trend: number;
  icon: string;
};

export type ChatPlaygroundResponse = {
  message: string;
  confidence: number;
  responseTime: number;
  tokenUsage: number;
  model: string;
  chunksUsed: number;
  languageDetected: Language;
  retrievalMethod: string;
  retrievedSources: string[];
};

export type PromptSettings = {
  prompt: string;
  tone: PromptVersion["tone"];
  languageMode: PromptVersion["languageMode"];
};

export type ModelSettings = {
  chatModel: string;
  embeddingModel: string;
  temperature: number;
  maxTokens: number;
  similarityThreshold: number;
  topK: number;
  enableCitations: boolean;
  enableFallbackAnswer: boolean;
  enableStreaming: boolean;
};

export type GuardrailSettings = {
  blockHarmfulContent: boolean;
  blockNonSnakitosAnswers: boolean;
  forceSourceCitation: boolean;
  refuseUnknownAnswers: boolean;
  detectPromptInjection: boolean;
  limitPersonalDataCollection: boolean;
  enableProfanityFilter: boolean;
  blockCompetitorComparisons: boolean;
  blockFakeDiscountClaims: boolean;
  blockSensitiveAdvice: boolean;
  blockedTopics: string[];
  promptInjectionExamples: { id: string; phrase: string; severity: Severity; action: string }[];
};

export type SettingsState = {
  general: {
    brandName: string;
    supportEmail: string;
    websiteUrl: string;
    defaultLanguage: Language;
  };
  apiKeys: {
    openAiKey: string;
    vectorDbKey: string;
    shopifyApiKey: string;
  };
  widgetAppearance: {
    chatbotName: string;
    welcomeMessage: string;
    primaryColor: string;
    position: "bottom-right" | "bottom-left";
    enableLogo: boolean;
  };
  rateLimits: {
    requestsPerIp: number;
    requestsPerUser: number;
    cooldownTime: number;
    blockAbusiveUsers: boolean;
  };
  notifications: {
    failedAnswers: boolean;
    highTokenUsage: boolean;
    crawlerFailure: boolean;
    shopifySyncFailure: boolean;
  };
  backupExport: {
    lastBackupAt: string;
  };
};

export type BudgetSettings = {
  monthlyBudget: number;
  alertThreshold: number;
};

export type CrawlerSettings = {
  websiteUrl: string;
  depth: number;
  includePatterns: string;
  excludePatterns: string;
  autoDetectProductPages: boolean;
  autoDetectFaqPages: boolean;
  autoDetectPolicyPages: boolean;
  respectRobots: boolean;
};

export type CrawlerProgress = {
  totalPagesFound: number;
  pagesIndexed: number;
  failedPages: number;
  currentUrl: string;
  progress: number;
  running: boolean;
};

export type ControlCenterSnapshot = {
  currentUser: AdminUser;
  notifications: NotificationItem[];
  dashboardMetrics: DashboardMetric[];
  products: Product[];
  websitePages: WebsitePage[];
  faqs: FaqItem[];
  knowledgeSources: KnowledgeSource[];
  knowledgeChunks: KnowledgeChunk[];
  conversations: Conversation[];
  failedAnswers: FailedAnswer[];
  tickets: Ticket[];
  users: AdminUser[];
  auditLogs: AuditLog[];
  tokenUsage: TokenUsageRecord[];
  promptVersions: PromptVersion[];
  crawlerLogs: CrawlerLog[];
  shopifySyncLogs: ShopifySyncLog[];
  sourceHealth: SourceHealth[];
  queriesLast7Days: ChartPoint[];
  topProductQuestions: ChartPoint[];
  languageDistribution: ChartPoint[];
  engagementBars: ChartPoint[];
  queryVolume: ChartPoint[];
  failedAnswerTrend: ChartPoint[];
  satisfactionTrend: ChartPoint[];
  tokenCostTrend: ChartPoint[];
  intentDistribution: ChartPoint[];
  tokenBudget: BudgetSettings;
  modelSettings: ModelSettings;
  guardrails: GuardrailSettings;
  promptSettings: PromptSettings;
  settings: SettingsState;
  crawlerSettings: CrawlerSettings;
  crawlerProgress: CrawlerProgress;
  shopifyConnection: {
    storeUrl: string;
    apiKey: string;
    connected: boolean;
    lastSyncTime: string;
  };
};
