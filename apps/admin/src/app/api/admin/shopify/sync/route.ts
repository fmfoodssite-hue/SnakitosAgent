import { NextResponse } from "next/server";
import { syncShopifyResource } from "@/lib/shopify-admin";

export async function POST(request: Request) {
  const { resource } = (await request.json()) as {
    resource?: "products" | "orders" | "customers";
  };

  if (!resource) {
    return NextResponse.json({ error: "Resource is required." }, { status: 400 });
  }

  const result = await syncShopifyResource(resource);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
