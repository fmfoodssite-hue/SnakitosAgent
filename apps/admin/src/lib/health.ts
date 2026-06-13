import { assertServiceClient } from "@/lib/db";
import { env } from "@/lib/env";

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

export async function checkDatabaseHealth() {
  return timed(async () => {
    const supabase = assertServiceClient();
    const { error } = await supabase.from("settings").select("id").limit(1);
    if (error) {
      throw error;
    }
  });
}

export async function checkVectorDbHealth() {
  if (env.RAG_VECTOR_PROVIDER === "pinecone") {
    if (!env.PINECONE_API_KEY || !env.PINECONE_INDEX) {
      return {
        status: "not_configured" as const,
        latency_ms: 0,
        error_message: "Pinecone environment variables are missing.",
      };
    }
  }

  return {
    status: "healthy" as const,
    latency_ms: 0,
    error_message: null,
  };
}

export async function checkOpenAIHealth() {
  if (!env.OPENAI_API_KEY) {
    return {
      status: "not_configured" as const,
      latency_ms: 0,
      error_message: "OPENAI_API_KEY is missing.",
    };
  }

  return {
    status: "healthy" as const,
    latency_ms: 0,
    error_message: null,
  };
}

export async function checkShopifyHealth() {
  if (!env.SHOPIFY_SHOP_DOMAIN || !env.SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    return {
      status: "not_configured" as const,
      latency_ms: 0,
      error_message: "Shopify Admin API credentials are missing.",
    };
  }

  return {
    status: "healthy" as const,
    latency_ms: 0,
    error_message: null,
  };
}

export async function checkCrawlerHealth() {
  return {
    status: "not_configured" as const,
    latency_ms: 0,
    error_message: "Crawler worker is not configured in this repo yet.",
  };
}

