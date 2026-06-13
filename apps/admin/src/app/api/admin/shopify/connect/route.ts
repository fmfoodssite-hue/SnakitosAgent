import { withAdminAccess, safeAudit } from "@/lib/server";
import { env } from "@/lib/env";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    const body = (await request.json().catch(() => ({}))) as { storeUrl?: string };

    if (!env.SHOPIFY_SHOP_DOMAIN || !env.SHOPIFY_ADMIN_API_ACCESS_TOKEN) {
      return errorResponse("NOT_CONFIGURED", "Shopify credentials must be provided via environment variables.", 503);
    }

    await safeAudit({
      adminId: admin.id,
      action: "shopify.connect_check",
      entityType: "shopify",
      details: { storeUrl: body.storeUrl ?? `https://${env.SHOPIFY_SHOP_DOMAIN}` },
      ipAddress,
    });

    return successResponse({
      connected: true,
      storeUrl: body.storeUrl ?? `https://${env.SHOPIFY_SHOP_DOMAIN}`,
    });
  });
}

