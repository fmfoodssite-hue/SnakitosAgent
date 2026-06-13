import { withAdminAccess } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { env } from "@/lib/env";
import { errorResponse, noDataResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const supabase = assertServiceClient();
      const alerts: Array<Record<string, unknown>> = [];

      const { data: products } = await supabase
        .from("shopify_products")
        .select("last_synced_at")
        .order("last_synced_at", { ascending: false })
        .limit(1);

      const lastSync = products?.[0]?.last_synced_at;
      if (env.SHOPIFY_SHOP_DOMAIN && env.SHOPIFY_ADMIN_API_ACCESS_TOKEN && lastSync) {
        const staleHours = (Date.now() - new Date(lastSync).getTime()) / 3_600_000;
        if (staleHours > 24) {
          alerts.push({
            alert_type: "shopify_sync_stale",
            severity: staleHours > 72 ? "high" : "medium",
            title: "Shopify sync is stale",
            description: `Latest Shopify sync is ${Math.round(staleHours)} hours old.`,
            affected_system: "shopify",
            status: "open",
          });
        }
      }

      if (!env.OPENAI_API_KEY) {
        alerts.push({
          alert_type: "openai_not_configured",
          severity: "high",
          title: "OpenAI is not configured",
          description: "Playground and embedding-backed features cannot run.",
          affected_system: "openai_api",
          status: "open",
        });
      }

      return alerts.length > 0 ? successResponse(alerts) : noDataResponse([]);
    } catch (error) {
      console.error("Alerts latest failed", error);
      return errorResponse("ALERTS_LOAD_FAILED", "Unable to load alerts.", 500);
    }
  });
}
