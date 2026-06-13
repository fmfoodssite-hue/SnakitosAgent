import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";
import { syncShopifyProducts } from "@/lib/services/shopify";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      const body = (await request.json().catch(() => ({}))) as { action?: "toggle_bot" | "resync" };
      const supabase = assertServiceClient();

      if (body.action === "toggle_bot") {
        const { data: product, error: fetchError } = await supabase
          .from("shopify_products")
          .select("*")
          .eq("id", id)
          .single();
        if (fetchError || !product) {
          return errorResponse("NOT_FOUND", "Shopify product not found.", 404);
        }
        const metadata = asRecord(product.metadata);
        const excludeFromBot = !Boolean(metadata.excludeFromBot);
        const { data, error } = await supabase
          .from("shopify_products")
          .update({
            metadata: {
              ...metadata,
              excludeFromBot,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw error;

        await safeAudit({
          adminId: admin.id,
          action: "shopify.toggle_bot",
          entityType: "shopify_product",
          entityId: id,
          details: { excludeFromBot },
          ipAddress,
        });
        return successResponse(data);
      }

      if (body.action === "resync") {
        await syncShopifyProducts();
        const { data, error } = await supabase
          .from("shopify_products")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw error;

        await safeAudit({
          adminId: admin.id,
          action: "shopify.resync_product",
          entityType: "shopify_product",
          entityId: id,
          ipAddress,
        });
        return successResponse(data);
      }

      return errorResponse("VALIDATION_FAILED", "Unsupported Shopify product action.", 400);
    } catch (error) {
      console.error("Shopify product update failed", error);
      return errorResponse("SHOPIFY_PRODUCT_UPDATE_FAILED", "Unable to update Shopify product.", 500);
    }
  });
}

