import { env } from "@/lib/env";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

function normalizeShopDomain(domain: string) {
  return domain.replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
}

export async function syncShopifyResource(resource: "products" | "orders" | "customers") {
  const supabase = getSupabaseServiceClient();
  const startedAt = new Date().toISOString();
  const logId = crypto.randomUUID();

  const insertLog = async (status: string, message: string, recordsProcessed = 0) => {
    if (!supabase) return;
    await supabase.from("shopify_sync_logs").insert({
      id: logId,
      sync_type: resource,
      status,
      records_processed: recordsProcessed,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      message,
    });
  };

  const domain = normalizeShopDomain(env.shopifyDomain);
  if (!domain || !env.shopifyToken) {
    await insertLog("failed", "Missing Shopify credentials.");
    return { ok: false, message: "Missing Shopify credentials.", recordsProcessed: 0 };
  }

  const endpoint =
    resource === "products"
      ? `https://${domain}/admin/api/2025-01/products.json?limit=50`
      : resource === "orders"
        ? `https://${domain}/admin/api/2025-01/orders.json?status=any&limit=50`
        : `https://${domain}/admin/api/2025-01/customers.json?limit=50`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        "X-Shopify-Access-Token": env.shopifyToken,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const message = `Shopify sync failed with status ${response.status}.`;
      await insertLog("failed", message);
      return { ok: false, message, recordsProcessed: 0 };
    }

    const data = (await response.json()) as Record<string, unknown[]>;
    const key = resource as keyof typeof data;
    const records = Array.isArray(data[key]) ? data[key].length : 0;
    await insertLog("success", `${resource} synced successfully.`, records);

    return { ok: true, message: `${resource} synced successfully.`, recordsProcessed: records };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected Shopify sync error.";
    await insertLog("failed", message);
    return { ok: false, message, recordsProcessed: 0 };
  }
}
