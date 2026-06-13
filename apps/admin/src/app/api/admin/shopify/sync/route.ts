import { withAdminAccess, safeAudit } from "@/lib/server";
import { errorResponse, successResponse } from "@/lib/response";
import { syncShopifyProducts } from "@/lib/services/shopify";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      if (!env.SHOPIFY_SHOP_DOMAIN || !env.SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
        return successResponse({
          status: "not_configured",
          message: "Shopify credentials are not configured.",
        });
      }

      const body = (await request.json().catch(() => ({}))) as {
        collection_handle?: string;
      };

      const result = await syncShopifyProducts({
        collectionHandle: body.collection_handle,
        triggeredBy: admin.id,
      });

      await safeAudit({
        adminId: admin.id,
        action: "shopify.sync",
        entityType: "shopify_product",
        details: {
          synced: result.synced,
          changed: result.changed,
          skipped: result.skipped,
          failed: result.failed ?? 0,
          syncJobId: result.syncJobId,
        },
        ipAddress,
      });

      return successResponse({
        status: "ok",
        ...result,
      });
    } catch (error) {
      console.error("Shopify sync failed", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      return errorResponse("SHOPIFY_SYNC_FAILED", `Shopify sync failed: ${msg}`, 500);
    }
  });
}
