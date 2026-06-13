import { createHash } from "crypto";
import { env } from "@/lib/env";
import { assertServiceClient } from "@/lib/db";

type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  variants?: Array<{ price?: string; inventory_quantity?: number; title?: string }>;
  images?: Array<{ src?: string; alt?: string }>;
  tags?: string;
  updated_at?: string;
};

async function shopifyFetch(path: string) {
  if (!env.SHOPIFY_SHOP_DOMAIN || !env.SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    throw new Error("Shopify Admin API credentials are missing.");
  }
  const response = await fetch(`https://${env.SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/${path}`, {
    headers: {
      "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Shopify request failed: ${response.status} ${response.statusText}`);
  return response.json() as Promise<Record<string, unknown>>;
}

function normalizeProduct(product: ShopifyProduct) {
  const firstVariant = product.variants?.[0];
  const price = firstVariant?.price ? Number(firstVariant.price) : null;
  const stockStatus =
    typeof firstVariant?.inventory_quantity === "number"
      ? firstVariant.inventory_quantity > 0 ? "in_stock" : "out_of_stock"
      : "unknown";

  const normalized = {
    product_id: String(product.id),
    title: product.title,
    handle: product.handle,
    description: product.body_html ?? "",
    price,
    variants: product.variants ?? [],
    images: product.images ?? [],
    collection: null as string | null,
    tags: product.tags ? product.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    stock_status: stockStatus,
    product_url: `${env.SHOPIFY_STOREFRONT_BASE_URL.replace(/\/$/, "")}/products/${product.handle}`,
    source_updated_at: product.updated_at ?? new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Compute hash of product content (for change detection)
  const hashContent = JSON.stringify({
    title: normalized.title,
    description: normalized.description,
    price: normalized.price,
    stockStatus: normalized.stock_status,
    tags: normalized.tags,
  });
  const contentHash = createHash("sha256").update(hashContent).digest("hex");

  return { ...normalized, content_hash: contentHash };
}

export async function pingShopify(): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  if (!env.SHOPIFY_SHOP_DOMAIN || !env.SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
    return { ok: false, latency_ms: 0, error: "Shopify credentials not configured." };
  }
  const startedAt = Date.now();
  try {
    await shopifyFetch("shop.json");
    return { ok: true, latency_ms: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function syncShopifyProducts(
  input: {
    collectionHandle?: string;
    triggeredBy?: string;
  } = {},
) {
  const supabase = assertServiceClient();

  // Create sync job record
  const { data: syncJob } = await supabase
    .from("shopify_sync_jobs")
    .insert({
      status: "running",
      triggered_by: input.triggeredBy ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  const syncJobId = syncJob?.id ?? null;

  try {
    const query = input.collectionHandle
      ? `products.json?collection_id=${input.collectionHandle}&limit=250`
      : "products.json?limit=250";

    const payload = await shopifyFetch(query);
    const rawProducts = ((payload.products ?? []) as ShopifyProduct[]).map(normalizeProduct);

    if (rawProducts.length === 0) {
      if (syncJobId) {
        await supabase.from("shopify_sync_jobs").update({
          status: "completed",
          records_synced: 0,
          records_changed: 0,
          completed_at: new Date().toISOString(),
        }).eq("id", syncJobId);
      }
      return { synced: 0, changed: 0, skipped: 0, syncJobId };
    }

    // Fetch existing records to compare hashes
    const productIds = rawProducts.map((p) => p.product_id);
    const { data: existing } = await supabase
      .from("shopify_products")
      .select("product_id, content_hash")
      .in("product_id", productIds);

    const existingHashMap = new Map<string, string>(
      (existing ?? []).map((e: { product_id: string; content_hash: string | null }) => [
        e.product_id,
        e.content_hash ?? "",
      ]),
    );

    // Only upsert products that have changed
    const changed = rawProducts.filter((p) => existingHashMap.get(p.product_id) !== p.content_hash);
    const skipped = rawProducts.length - changed.length;

    let synced = 0;
    let failed = 0;

    if (changed.length > 0) {
      const { data: upserted, error: upsertError } = await supabase
        .from("shopify_products")
        .upsert(changed, { onConflict: "product_id" })
        .select("product_id");

      if (upsertError) {
        failed = changed.length;
        console.error("Shopify upsert error", upsertError);
      } else {
        synced = (upserted ?? []).length;
      }
    }

    // Also write to legacy shopify_sync_logs for compat
    await supabase.from("shopify_sync_logs").insert({
      sync_type: "products",
      status: failed > 0 ? "partial_failure" : "completed",
      records_processed: rawProducts.length,
      records_changed: synced,
      records_failed: failed,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      triggered_by: input.triggeredBy ?? null,
    });

    if (syncJobId) {
      await supabase.from("shopify_sync_jobs").update({
        status: failed > 0 ? "partial_failure" : "completed",
        records_synced: rawProducts.length,
        records_changed: synced,
        records_failed: failed,
        completed_at: new Date().toISOString(),
      }).eq("id", syncJobId);
    }

    return { synced, changed: synced, skipped, failed, syncJobId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown sync error";
    if (syncJobId) {
      await supabase.from("shopify_sync_jobs").update({
        status: "failed",
        error_message: errorMsg,
        completed_at: new Date().toISOString(),
      }).eq("id", syncJobId);
    }
    throw err;
  }
}

export async function listShopifyProducts() {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("shopify_products")
    .select("*")
    .order("last_synced_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
