export interface ShopifyOrder {
  id: string;
  name: string;
  total_price: string;
  created_at: string;
  customer?: {
    first_name: string;
    last_name: string;
  };
  financial_status: string;
}

export async function getRecentOrders(): Promise<ShopifyOrder[]> {
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  if (!domain || !token) {
    console.warn("Shopify credentials not found in environment variables.");
    return [];
  }

  try {
    const response = await fetch(
      `https://${domain}/admin/api/2024-01/orders.json?limit=5&status=any`,
      {
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) throw new Error("Failed to fetch Shopify orders");

    const data = await response.json();
    return data.orders;
  } catch (error) {
    console.error("Shopify Error:", error);
    return [];
  }
}

export async function getStoreStats() {
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  if (!domain || !token) return null;

  try {
    // In a real app, you'd aggregate this or use a dashboard API
    // For now, let's fetch total order count as a placeholder
    const response = await fetch(
      `https://${domain}/admin/api/2024-01/orders/count.json`,
      {
        headers: { "X-Shopify-Access-Token": token },
      }
    );
    const data = await response.json();
    return {
      orderCount: data.count || 0,
    };
  } catch (error) {
    return null;
  }
}
