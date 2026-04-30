import { OrderLookupResult, ProductLookupResult } from "./order.types";

export type AgentIntent = "order" | "product" | "general";

export type MessageRole = "user" | "bot";

export type KnowledgeDocument = {
  id: string;
  name: string;
  text: string;
  link: string;
  type: string;
  category: string;
  source: string;
};

export type AgentContext = {
  order?: Partial<OrderLookupResult>;
  products?: ProductLookupResult[];
  knowledge?: KnowledgeDocument[];
  recentMessages?: Array<{ role: MessageRole; content: string }>;
  policies?: Record<string, string>;
};

export type ChatRequestBody = {
  message: string;
  userId?: string;
  chatId?: string;
  email?: string;
  phone?: string;
};

export type ChatRequestInput = ChatRequestBody;

export type ChatResponsePayload = {
  response: string;
  intent: AgentIntent;
  chatId: string;
  userId: string;
  data?: unknown;
};

export type AiGenerationInput = {
  intent: AgentIntent;
  userMessage: string;
  context: AgentContext;
};
