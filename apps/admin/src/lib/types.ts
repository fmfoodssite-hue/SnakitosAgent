import type {
  ADMIN_ROLES,
  DOCUMENT_STATUSES,
  EXTRACTION_STATUS,
  HANDOFF_STATUSES,
  HANDOFF_TYPES,
  KNOWLEDGE_CATEGORIES,
  PRIORITIES,
  SOURCE_TYPES,
  EMBEDDING_STATUS,
} from "@/lib/constants";

export type AdminRole = (typeof ADMIN_ROLES)[number];
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];
export type HandoffType = (typeof HANDOFF_TYPES)[number];
export type ExtractionStatus = (typeof EXTRACTION_STATUS)[number];
export type EmbeddingStatus = (typeof EMBEDDING_STATUS)[number];

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  role: AdminRole;
  is_active: boolean;
  last_login_at?: string | null;
  avatar_url?: string | null;
};

export type AdminSession = {
  adminId: string;
  sessionId: string;
  role: AdminRole;
  email: string;
  expiresAt: number;
};

export type KnowledgeDocument = {
  id: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
  source_type: SourceType;
  priority: Priority;
  status: DocumentStatus;
  created_by?: string | null;
  updated_by?: string | null;
  metadata: Record<string, Json>;
  created_at: string;
  updated_at: string;
};

export type UploadedFileRecord = {
  id: string;
  file_name: string;
  file_type: string;
  storage_path: string;
  file_size: number;
  extraction_status: ExtractionStatus;
  embedding_status: EmbeddingStatus;
  chunk_count: number;
  document_id?: string | null;
  metadata: Record<string, Json>;
  created_at: string;
  updated_at: string;
};

export type ShopifyProductRecord = {
  id: string;
  product_id: string;
  title: string;
  handle: string;
  description?: string | null;
  price?: number | null;
  variants: Json[];
  images: Json[];
  collection?: string | null;
  tags: string[];
  stock_status?: string | null;
  product_url?: string | null;
  last_synced_at?: string | null;
  source_updated_at?: string | null;
};

export type PromptVersion = {
  id: string;
  version_label: string;
  system_prompt: string;
  fallback_message: string;
  language_rules: string;
  escalation_rules: string;
  anti_hallucination_rules: string;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
};

export type HandoffTicket = {
  id: string;
  ticket_number: string;
  session_id?: string | null;
  complaint_type: HandoffType;
  status: HandoffStatus;
  customer_identifier?: string | null;
  summary: string;
  proof_required: boolean;
  assigned_to?: string | null;
  metadata: Record<string, Json>;
  created_at: string;
  updated_at: string;
};

export type AuditLogRecord = {
  id: string;
  admin_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details: Record<string, Json>;
  ip_address?: string | null;
  created_at: string;
};

export type DashboardMetric = {
  label: string;
  value: string;
  helper?: string;
  tone?: "default" | "success" | "warning" | "danger";
};

