import { z } from "zod";

// ---------------------------------------------------------------------------
// Build-phase detection
// During `next build`, Next.js sets NEXT_PHASE to evaluate pages statically.
// Server-only secrets (ADMIN_SESSION_SECRET, SERVICE_ROLE_KEY) are not
// available at build time on Vercel — they're injected at runtime.
// We skip strict validation during build and enforce it at request time instead.
// ---------------------------------------------------------------------------
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-export";

// Required at runtime, optional at build time (Vercel injects at runtime)
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
  // Supabase — required at runtime
  NEXT_PUBLIC_SUPABASE_URL:  urlValidator,
  SUPABASE_URL:              urlValidator,
  SUPABASE_ANON_KEY:         runtimeRequiredString,
  SUPABASE_SERVICE_ROLE_KEY: runtimeRequiredString,

  // Admin session — required at runtime
  ADMIN_SESSION_SECRET: sessionSecretValidator,

  // Optional: auto-seed first admin (remove from env after first login)
  ADMIN_BOOTSTRAP_EMAIL:    z.string().email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8).optional(),

  // OpenAI
  OPENAI_API_KEY:         z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  // Vector DB
  RAG_VECTOR_PROVIDER: z.enum(["supabase", "pinecone"]).default("supabase"),
  PINECONE_API_KEY:    z.string().optional(),
  PINECONE_INDEX:      z.string().optional(),
  PINECONE_NAMESPACE:  z.string().default("snakitos-admin"),

  // Shopify
  SHOPIFY_SHOP_DOMAIN:            z.string().optional(),
  SHOPIFY_ADMIN_API_ACCESS_TOKEN: z.string().optional(),
  SHOPIFY_STOREFRONT_BASE_URL:    z.string().url().default("https://snakitos.com"),

  // Storage
  UPLOAD_STORAGE_BUCKET: z.string().default("admin-uploads"),

  // Admin app base path
  NEXT_PUBLIC_ADMIN_BASE_PATH: z.string().default("/admin"),
});

function parseEnv() {
  const result = envSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL:       process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_URL:                   process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY:              process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY:      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_SESSION_SECRET:           process.env.ADMIN_SESSION_SECRET,
    ADMIN_BOOTSTRAP_EMAIL:          process.env.ADMIN_BOOTSTRAP_EMAIL,
    ADMIN_BOOTSTRAP_PASSWORD:       process.env.ADMIN_BOOTSTRAP_PASSWORD,
    OPENAI_API_KEY:                 process.env.OPENAI_API_KEY,
    OPENAI_EMBEDDING_MODEL:         process.env.OPENAI_EMBEDDING_MODEL,
    RAG_VECTOR_PROVIDER:            process.env.RAG_VECTOR_PROVIDER,
    PINECONE_API_KEY:               process.env.PINECONE_API_KEY,
    PINECONE_INDEX:                 process.env.PINECONE_INDEX,
    PINECONE_NAMESPACE:             process.env.PINECONE_NAMESPACE,
    SHOPIFY_SHOP_DOMAIN:            process.env.SHOPIFY_SHOP_DOMAIN,
    SHOPIFY_ADMIN_API_ACCESS_TOKEN: process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    SHOPIFY_STOREFRONT_BASE_URL:    process.env.SHOPIFY_STOREFRONT_BASE_URL,
    UPLOAD_STORAGE_BUCKET:          process.env.UPLOAD_STORAGE_BUCKET,
    NEXT_PUBLIC_ADMIN_BASE_PATH:    process.env.NEXT_PUBLIC_ADMIN_BASE_PATH,
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    if (isBuildPhase) {
      // Non-fatal during build — log and continue with safe defaults
      console.warn(
        `[env] Some environment variables are missing during build phase.\n` +
        `These must be set in your deployment platform (Vercel/etc) for runtime:\n${issues}`
      );
    } else {
      // Fatal at runtime — a missing secret means the app is misconfigured
      throw new Error(`Missing or invalid environment variables:\n${issues}`);
    }
  }

  // Return parsed data or empty object on build-phase failures (runtime will re-validate)
  return result.data ?? {} as z.infer<typeof envSchema>;
}

export const env = parseEnv() as z.infer<typeof envSchema>;

/** True when all admin secrets are available (use to gate server operations) */
export function hasAdminSecrets() {
  return Boolean(
    env.SUPABASE_URL &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    env.ADMIN_SESSION_SECRET
  );
}

/** True when OpenAI can be called */
export function hasOpenAI() {
  return Boolean(env.OPENAI_API_KEY);
}

/** True when Shopify sync can run */
export function hasShopify() {
  return Boolean(env.SHOPIFY_SHOP_DOMAIN && env.SHOPIFY_ADMIN_API_ACCESS_TOKEN);
}

/** True when Pinecone is configured */
export function hasPinecone() {
  return Boolean(env.PINECONE_API_KEY && env.PINECONE_INDEX);
}
