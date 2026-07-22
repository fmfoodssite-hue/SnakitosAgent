import path from "path";
import dotenv from "dotenv";

function loadEnvFiles(): void {
  const candidatePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "..", "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env.local"),
  ];

  for (const envPath of candidatePaths) {
    dotenv.config({
      path: envPath,
      override: envPath.endsWith(".env.local"),
      quiet: true,
    });
  }
}

loadEnvFiles();

function getEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

const DEFAULT_STOREFRONT_DOMAIN = "snakitos.com";
const DEFAULT_OPENAI_MAX_TOKENS = 1000;

function normalizeShopDomain(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
}

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const rawValue = getEnv(name);
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveShopifyAdminDomain(): string {
  return normalizeShopDomain(getEnv("SHOPIFY_ADMIN_DOMAIN"));
}

export const config = {
  app: {
    // Use ADMIN_SESSION_SECRET (the real signed-cookie secret) — not ADMIN_SECRET_KEY
    adminSecret: getEnv("ADMIN_SESSION_SECRET"),
    whatsappNumber: getEnv("SUPPORT_WHATSAPP") || "+92-343-6366369",
    supportPhone: getEnv("SUPPORT_PHONE") || "+92-345-8283825",
    supportEmail: "info@snakitos.com",
    openAiModel: "gpt-4o",
    openAiMaxTokens: getPositiveIntegerEnv("OPENAI_MAX_TOKENS", DEFAULT_OPENAI_MAX_TOKENS),
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
    storefrontDomain: normalizeShopDomain(
      getEnv("SHOPIFY_SHOP_DOMAIN") || DEFAULT_STOREFRONT_DOMAIN,
    ),
    accessToken: getEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN"),
    clientId: getEnv("SHOPIFY_CLIENT_ID"),
    clientSecret: getEnv("SHOPIFY_CLIENT_SECRET"),
    apiVersion: getEnv("SHOPIFY_API_VERSION") || "2025-01",
  },
  pinecone: {
    apiKey: getEnv("PINECONE_API_KEY"),
    indexName: getEnv("PINECONE_INDEX"),
    namespace: getEnv("PINECONE_NAMESPACE"),
    host: getEnv("PINECONE_HOST") || getEnv("PINECONE_INDEX_HOST"),
  },
} as const;

export function hasRequiredRuntimeConfig(): boolean {
  return Boolean(
    config.app.adminSecret &&
      config.openai.apiKey &&
      config.supabase.url &&
      config.supabase.serviceRoleKey &&
      config.shopify.adminDomain &&
      (config.shopify.accessToken ||
        (config.shopify.clientId && config.shopify.clientSecret)),
  );
}
