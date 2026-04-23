import dotenv from "dotenv";

dotenv.config();

function getEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

function normalizeShopDomain(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
}

function resolveShopifyAdminDomain(): string {
  const explicitAdminDomain =
    getEnv("SHOPIFY_ADMIN_DOMAIN") ||
    getEnv("SHOPIFY_ADMIN_SHOP_DOMAIN") ||
    getEnv("SHOPIFY_MYSHOPIFY_DOMAIN");
  const fallbackDomain = getEnv("SHOPIFY_SHOP_DOMAIN");

  return normalizeShopDomain(explicitAdminDomain || fallbackDomain);
}

export const config = {
  app: {
    adminSecret: getEnv("ADMIN_SECRET") || getEnv("ADMIN_SECRET_KEY"),
    whatsappNumber: "+92-345-828-3827",
    openAiModel: "gpt-4o",
  },
  openai: {
    apiKey: getEnv("OPENAI_API_KEY"),
  },
  supabase: {
    url: getEnv("SUPABASE_URL"),
    anonKey: getEnv("SUPABASE_ANON_KEY"),
    serviceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  },
  shopify: {
    adminDomain: resolveShopifyAdminDomain(),
    storefrontDomain: normalizeShopDomain(getEnv("SHOPIFY_SHOP_DOMAIN")),
    accessToken: getEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN"),
    apiVersion: getEnv("SHOPIFY_API_VERSION") || "2025-01",
  },
  pinecone: {
    apiKey: getEnv("PINECONE_API_KEY"),
    indexName: getEnv("PINECONE_INDEX"),
    namespace: getEnv("PINECONE_NAMESPACE"),
  },
} as const;

export function hasRequiredRuntimeConfig(): boolean {
  return Boolean(
    config.app.adminSecret &&
      config.openai.apiKey &&
      config.supabase.url &&
      config.supabase.serviceRoleKey &&
      config.shopify.adminDomain &&
      config.shopify.accessToken,
  );
}
