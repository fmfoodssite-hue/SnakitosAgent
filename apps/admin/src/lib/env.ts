import { z } from "zod";

const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-export";

const runtimeRequiredString = isBuildPhase
  ? z.string().optional().default("")
  : z.string().min(1);

const sessionSecretValidator = isBuildPhase
  ? z.string().optional().default("")
  : z.string().min(32, "ADMIN_SESSION_SECRET must be at least 32 characters");

const urlValidator = isBuildPhase
  ? z.string().optional().default("https://placeholder.local")
  : z.string().url();

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: urlValidator,
  SUPABASE_URL: urlValidator,
  SUPABASE_ANON_KEY: runtimeRequiredString,
  SUPABASE_SERVICE_ROLE_KEY: runtimeRequiredString,
  ADMIN_SESSION_SECRET: sessionSecretValidator,
  ADMIN_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  ADMIN_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8).optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  RAG_VECTOR_PROVIDER: z.enum(["supabase", "pinecone"]).default("supabase"),
  PINECONE_API_KEY: z.string().optional(),
  PINECONE_INDEX: z.string().optional(),
  PINECONE_NAMESPACE: z.string().default("snakitos-admin"),
  SHOPIFY_SHOP_DOMAIN: z.string().optional(),
  SHOPIFY_ADMIN_API_ACCESS_TOKEN: z.string().optional(),
  SHOPIFY_STOREFRONT_BASE_URL: z.string().url().default("https://snakitos.com"),
  UPLOAD_STORAGE_BUCKET: z.string().default("admin-uploads"),
  NEXT_PUBLIC_ADMIN_BASE_PATH: z.string().default("/admin"),
});

function parseEnv() {
  const result = envSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
    ADMIN_ACCESS_TOKEN_TTL_MINUTES: process.env.ADMIN_ACCESS_TOKEN_TTL_MINUTES,
    ADMIN_REFRESH_TOKEN_TTL_DAYS: process.env.ADMIN_REFRESH_TOKEN_TTL_DAYS,
    ADMIN_BOOTSTRAP_EMAIL: process.env.ADMIN_BOOTSTRAP_EMAIL,
    ADMIN_BOOTSTRAP_PASSWORD: process.env.ADMIN_BOOTSTRAP_PASSWORD,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL,
    RAG_VECTOR_PROVIDER: process.env.RAG_VECTOR_PROVIDER,
    PINECONE_API_KEY: process.env.PINECONE_API_KEY,
    PINECONE_INDEX: process.env.PINECONE_INDEX,
    PINECONE_NAMESPACE: process.env.PINECONE_NAMESPACE,
    SHOPIFY_SHOP_DOMAIN: process.env.SHOPIFY_SHOP_DOMAIN,
    SHOPIFY_ADMIN_API_ACCESS_TOKEN: process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    SHOPIFY_STOREFRONT_BASE_URL: process.env.SHOPIFY_STOREFRONT_BASE_URL,
    UPLOAD_STORAGE_BUCKET: process.env.UPLOAD_STORAGE_BUCKET,
    NEXT_PUBLIC_ADMIN_BASE_PATH: process.env.NEXT_PUBLIC_ADMIN_BASE_PATH,
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    if (isBuildPhase) {
      console.warn(
        "[env] Some environment variables are missing during build phase.\n" +
          `These must be set in your deployment platform for runtime:\n${issues}`,
      );
    } else {
      throw new Error(`Missing or invalid environment variables:\n${issues}`);
    }
  }

  return (result.data ?? {}) as z.infer<typeof envSchema>;
}

export const env = parseEnv() as z.infer<typeof envSchema>;

export function hasAdminSecrets() {
  return Boolean(
    env.SUPABASE_URL &&
      env.SUPABASE_SERVICE_ROLE_KEY &&
      env.ADMIN_SESSION_SECRET,
  );
}

export function hasOpenAI() {
  return Boolean(env.OPENAI_API_KEY);
}

export function hasShopify() {
  return Boolean(env.SHOPIFY_SHOP_DOMAIN && env.SHOPIFY_ADMIN_API_ACCESS_TOKEN);
}

export function hasPinecone() {
  return Boolean(env.PINECONE_API_KEY && env.PINECONE_INDEX);
}
