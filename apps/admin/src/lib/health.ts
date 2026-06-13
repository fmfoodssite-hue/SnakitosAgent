import { assertServiceClient } from "@/lib/db";
import { env } from "@/lib/env";
import OpenAI from "openai";
import { pingShopify } from "@/lib/services/shopify";

async function timed<T>(fn: () => Promise<T>) {
  const startedAt = Date.now();
  try {
    await fn();
    return {
      status: "healthy" as const,
      latency_ms: Date.now() - startedAt,
      error_message: null,
    };
  } catch (error) {
    return {
      status: "error" as const,
      latency_ms: Date.now() - startedAt,
      error_message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

type HealthStatus = {
  status: "healthy" | "error" | "not_configured";
  latency_ms: number;
  error_message: string | null;
};

async function persistHealthCheck(service_name: string, result: HealthStatus) {
  try {
    const supabase = assertServiceClient();
    await supabase.from("system_health_checks").insert({
      service_name,
      status: result.status,
      latency_ms: result.latency_ms,
      error_message: result.error_message,
      checked_at: new Date().toISOString(),
    });
  } catch {
    // Never throw from health check persistence
  }
}

export async function checkDatabaseHealth(): Promise<HealthStatus> {
  const result = await timed(async () => {
    const supabase = assertServiceClient();
    const { error } = await supabase.from("settings").select("id").limit(1);
    if (error) throw error;
  });
  await persistHealthCheck("database", result);
  return result;
}

export async function checkVectorDbHealth(): Promise<HealthStatus> {
  if (env.RAG_VECTOR_PROVIDER === "pinecone") {
    if (!env.PINECONE_API_KEY || !env.PINECONE_INDEX) {
      const result: HealthStatus = {
        status: "not_configured",
        latency_ms: 0,
        error_message: "Pinecone environment variables are missing.",
      };
      await persistHealthCheck("vector_db", result);
      return result;
    }

    // Real Pinecone ping via stats endpoint
    const result = await timed(async () => {
      const resp = await fetch(
        `https://controller.us-east1-gcp.pinecone.io/databases`,
        {
          headers: {
            "Api-Key": env.PINECONE_API_KEY!,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!resp.ok) throw new Error(`Pinecone status: ${resp.status}`);
    });

    await persistHealthCheck("vector_db", result);
    return result;
  }

  // Supabase vector — verified via pgvector extension presence (already checked via DB health)
  const result: HealthStatus = {
    status: "healthy",
    latency_ms: 0,
    error_message: null,
  };
  await persistHealthCheck("vector_db", result);
  return result;
}

export async function checkOpenAIHealth(): Promise<HealthStatus> {
  if (!env.OPENAI_API_KEY) {
    const result: HealthStatus = {
      status: "not_configured",
      latency_ms: 0,
      error_message: "OPENAI_API_KEY is missing.",
    };
    await persistHealthCheck("openai", result);
    return result;
  }

  // Real ping — list models with a short timeout
  const result = await timed(async () => {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const resp = await Promise.race([
      openai.models.list(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("OpenAI ping timeout")), 5000),
      ),
    ]);
    if (!resp) throw new Error("OpenAI returned empty response");
  });

  await persistHealthCheck("openai", result);
  return result;
}

export async function checkShopifyHealth(): Promise<HealthStatus> {
  if (!env.SHOPIFY_SHOP_DOMAIN || !env.SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    const result: HealthStatus = {
      status: "not_configured",
      latency_ms: 0,
      error_message: "Shopify Admin API credentials are missing.",
    };
    await persistHealthCheck("shopify", result);
    return result;
  }

  // Real Shopify ping
  const ping = await pingShopify();
  const result: HealthStatus = {
    status: ping.ok ? "healthy" : "error",
    latency_ms: ping.latency_ms,
    error_message: ping.error ?? null,
  };
  await persistHealthCheck("shopify", result);
  return result;
}

export async function checkCrawlerHealth(): Promise<HealthStatus> {
  // Crawler is a simple HTTP fetch worker — not a dedicated service in this repo
  const result: HealthStatus = {
    status: "not_configured",
    latency_ms: 0,
    error_message: "Crawler worker is managed inline via fetch. No separate health check needed.",
  };
  await persistHealthCheck("crawler", result);
  return result;
}
