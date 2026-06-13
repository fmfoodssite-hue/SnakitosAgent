import { withAdminAccess, safeAudit } from "@/lib/server";
import { errorResponse, successResponse } from "@/lib/response";
import { pingShopify } from "@/lib/services/shopify";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin", "content_manager", "viewer"], async () => {
    try {
      if (!env.SHOPIFY_SHOP_DOMAIN || !env.SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
        return successResponse({
          status: "not_configured",
          shop_domain: null,
          last_sync: null,
          message: "Shopify credentials are not configured in environment variables.",
        });
      }

      const ping = await pingShopify();
      return successResponse({
        status: ping.ok ? "connected" : "error",
        shop_domain: env.SHOPIFY_SHOP_DOMAIN,
        latency_ms: ping.latency_ms,
        error: ping.error ?? null,
      });
    } catch (error) {
      console.error("Shopify connect GET failed", error);
      return errorResponse("SHOPIFY_STATUS_FAILED", "Unable to check Shopify status.", 500);
    }
  });
}

export async function POST() {
  return withAdminAccess(["owner", "admin"], async ({ admin, ipAddress }) => {
    try {
      // Credentials come from env only — never accept them from the request body
      if (!env.SHOPIFY_SHOP_DOMAIN || !env.SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
        return successResponse({
          status: "not_configured",
          message: "Set SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_API_ACCESS_TOKEN environment variables.",
        });
      }

      // Validate credentials by pinging Shopify
      const ping = await pingShopify();
      if (!ping.ok) {
        return errorResponse(
          "SHOPIFY_CONNECT_FAILED",
          `Shopify connection failed: ${ping.error ?? "Unknown error"}`,
          400,
        );
      }

      await safeAudit({
        adminId: admin.id,
        action: "shopify.connect",
        entityType: "shopify_integration",
        details: { shop_domain: env.SHOPIFY_SHOP_DOMAIN, latency_ms: ping.latency_ms },
        ipAddress,
      });

      return successResponse({
        status: "connected",
        shop_domain: env.SHOPIFY_SHOP_DOMAIN,
        latency_ms: ping.latency_ms,
      });
    } catch (error) {
      console.error("Shopify connect failed", error);
      return errorResponse("SHOPIFY_CONNECT_FAILED", "Unable to verify Shopify connection.", 500);
    }
  });
}
