export const ADMIN_BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH || "/admin";

export function withAdminPath(path: string) {
  if (!path) return "/";
  if (path === ADMIN_BASE_PATH) return "/";
  if (path.startsWith(`${ADMIN_BASE_PATH}/`)) {
    return path.slice(ADMIN_BASE_PATH.length);
  }
  if (path.startsWith("/")) return path;
  return `/${path}`;
}

export function withAdminApiPath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!ADMIN_BASE_PATH || normalizedPath.startsWith(`${ADMIN_BASE_PATH}/`)) {
    return normalizedPath;
  }
  return `${ADMIN_BASE_PATH}${normalizedPath}`;
}

export const KNOWLEDGE_CATEGORIES = [
  "Products",
  "Deals",
  "Shipping",
  "Refunds",
  "Replacement",
  "Order Tracking",
  "Damaged Product",
  "Freshness",
  "Packaging",
  "Social Media",
  "Wholesale",
  "Store Contact",
  "General FAQ",
] as const;

export const ADMIN_ROLES = [
  "owner",
  "admin",
  "support_agent",
  "content_manager",
  "viewer",
] as const;

export const SOURCE_TYPES = [
  "manual",
  "shopify",
  "pdf",
  "csv",
  "docx",
  "faq",
  "website",
  "txt",
  "jsonl",
] as const;

export const PRIORITIES = ["high", "medium", "low"] as const;
export const DOCUMENT_STATUSES = ["draft", "active", "archived"] as const;
export const HANDOFF_STATUSES = ["open", "in_progress", "resolved", "escalated"] as const;

export const HANDOFF_TYPES = [
  "damaged_product",
  "wrong_order",
  "refund_request",
  "payment_issue",
  "allergy_safety_concern",
  "angry_customer",
  "wholesale_query",
  "unknown_order_tracking",
] as const;

export const EMBEDDING_STATUS = ["pending", "processing", "completed", "failed"] as const;
export const EXTRACTION_STATUS = ["pending", "processing", "completed", "failed"] as const;

export const PAGE_SIZE = 20;
export const DEFAULT_CHUNK_SIZE = 900;
export const DEFAULT_CHUNK_OVERLAP = 120;

export const OFFICIAL_SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/snakitos.pk/",
  tiktok: "https://www.tiktok.com/@snakitos",
  facebook: "https://www.facebook.com/snakitoss/",
  youtube: "https://www.youtube.com/@snakitos5728",
  otherPlatformMessage: "Please contact Snakitos support for official platform details.",
} as const;
