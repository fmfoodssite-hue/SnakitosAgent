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

  if (!response.ok) {
    throw new Error(`Shopify request failed with ${response.status}`);
  }

  return response.json();
}

function normalizeProduct(product: ShopifyProduct) {
  const firstVariant = product.variants?.[0];
  const price = firstVariant?.price ? Number(firstVariant.price) : null;
  const stockStatus =
    typeof firstVariant?.inventory_quantity === "number"
      ? firstVariant.inventory_quantity > 0
        ? "in_stock"
        : "out_of_stock"
      : "unknown";

  return {
    product_id: String(product.id),
    title: product.title,
    handle: product.handle,
    description: product.body_html ?? "",
    price,
    variants: product.variants ?? [],
    images: product.images ?? [],
    collection: null,
    tags: product.tags ? product.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
    stock_status: stockStatus,
    product_url: `${env.SHOPIFY_STOREFRONT_BASE_URL.replace(/\/$/, "")}/products/${product.handle}`,
    source_updated_at: product.updated_at ?? new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function syncShopifyProducts(collectionHandle?: string) {
  const supabase = assertServiceClient();
  const query = collectionHandle ? `products.json?collection_id=${collectionHandle}&limit=100` : "products.json?limit=100";
  const payload = await shopifyFetch(query);
  const products = ((payload.products ?? []) as ShopifyProduct[]).map(normalizeProduct);

  if (products.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("shopify_products")
    .upsert(products, { onConflict: "product_id" })
    .select("*");

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listShopifyProducts() {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("shopify_products")
    .select("*")
    .order("last_synced_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

