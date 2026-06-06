import { NextResponse } from "next/server";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { listShopifyProducts, syncShopifyProducts } from "@/lib/services/shopify";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin", "content_manager", "viewer"], async () => {
    const products = await listShopifyProducts();
    return NextResponse.json({ products });
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    const body = (await request.json().catch(() => ({}))) as { collection?: string };
    const products = await syncShopifyProducts(body.collection);

    await safeAudit({
      adminId: admin.id,
      action: "shopify.sync",
      entityType: "shopify_product",
      details: { count: products.length, collection: body.collection ?? "all" },
      ipAddress,
    });

    return NextResponse.json({ products, synced: products.length });
  });
}

