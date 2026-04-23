import { config } from "../config";
import {
  OrderLookupResult,
  OrderSearchNode,
  OrderVerificationResult,
  ProductLookupResult,
  ProductSearchNode,
} from "../types/order.types";
import {
  compareOrderReference,
  comparePhoneNumbers,
  extractNumericOrderId,
  normalizeOrderReference,
} from "../utils/validation.util";

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type GraphQlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 60_000;

function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    cache.delete(key);
    return null;
  }

  return cached.value as T;
}

function setCached<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): T {
  cache.set(key, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
  return value;
}

export class ShopifyService {
  private readonly endpoint = `https://${config.shopify.adminDomain}/admin/api/${config.shopify.apiVersion}/graphql.json`;

  async getVerifiedOrder(orderReference: string, phone: string): Promise<OrderVerificationResult | null> {
    const order = await this.findOrder(orderReference);
    if (!order) {
      return null;
    }

    const phones = [order.shippingPhone, order.customerPhone].filter(Boolean);
    const phoneVerified = phones.some((value) => comparePhoneNumbers(value ?? "", phone));
    const orderVerified = compareOrderReference(order, orderReference);

    if (!phoneVerified || !orderVerified) {
      return null;
    }

    return {
      ...order,
      verified: true,
    };
  }

  async findOrder(orderReference: string): Promise<OrderLookupResult | null> {
    const normalized = normalizeOrderReference(orderReference);
    if (!normalized) {
      return null;
    }

    const candidates = [
      `name:${JSON.stringify(normalized.startsWith("#") ? normalized : `#${normalized}`)}`,
      `order_number:${extractNumericOrderId(normalized)}`,
      normalized.startsWith("#")
        ? `confirmation_number:${JSON.stringify(normalized.replace(/^#/, ""))}`
        : "",
    ].filter(Boolean);

    for (const query of candidates) {
      const result = await this.searchOrders(query);
      const exact = result.find((order) => compareOrderReference(order, normalized));
      if (exact) {
        return exact;
      }
    }

    return null;
  }

  async searchProducts(query: string): Promise<ProductLookupResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const cacheKey = `products:${trimmed.toLowerCase()}`;
    const cached = getCached<ProductLookupResult[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await this.graphql<{
      products: {
        edges: Array<{ node: ProductSearchNode }>;
      };
    }>(
      `
        query SearchProducts($query: String!) {
          products(first: 5, query: $query) {
            edges {
              node {
                id
                legacyResourceId
                title
                handle
                status
                totalInventory
                variants(first: 5) {
                  edges {
                    node {
                      id
                      title
                      sku
                      price
                      inventoryQuantity
                    }
                  }
                }
              }
            }
          }
        }
      `,
      {
        query: `title:*${trimmed}* OR handle:*${trimmed}*`,
      },
    );

    const products: ProductLookupResult[] = data.products.edges.map(({ node }) => ({
      id: node.legacyResourceId,
      title: node.title,
      handle: node.handle,
      status: node.status,
      price: node.variants.edges[0]?.node.price ?? null,
      availability:
        typeof node.totalInventory === "number"
          ? node.totalInventory > 0
            ? "in_stock"
            : "out_of_stock"
          : "unknown",
      totalInventory: node.totalInventory,
      variants: node.variants.edges.map(({ node: variant }) => ({
        id: variant.id,
        title: variant.title,
        price: variant.price,
        sku: variant.sku,
        inventoryQuantity: variant.inventoryQuantity,
      })),
    }));

    return setCached(cacheKey, products);
  }

  async getRecentOrders(limit = 5): Promise<OrderLookupResult[]> {
    const data = await this.graphql<{
      orders: {
        edges: Array<{ node: OrderSearchNode }>;
      };
    }>(
      `
        query RecentOrders($limit: Int!) {
          orders(first: $limit, sortKey: PROCESSED_AT, reverse: true) {
            edges {
              node {
                id
                legacyResourceId
                name
                orderNumber
                displayFinancialStatus
                displayFulfillmentStatus
                createdAt
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                customer {
                  phone
                  email
                  displayName
                }
                shippingAddress {
                  phone
                  name
                  address1
                  city
                  province
                  country
                  zip
                }
                lineItems(first: 10) {
                  edges {
                    node {
                      title
                      quantity
                      sku
                      variantTitle
                      discountedTotalSet {
                        shopMoney {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
                fulfillments {
                  status
                  trackingInfo {
                    company
                    number
                    url
                  }
                }
              }
            }
          }
        }
      `,
      { limit },
    );

    return data.orders.edges.map(({ node }) => this.mapOrder(node));
  }

  async getStoreStats(): Promise<Record<string, number>> {
    const orders = await this.getRecentOrders(20);
    return {
      recentOrders: orders.length,
      fulfilledOrders: orders.filter((order) =>
        order.fulfillmentStatus.toLowerCase().includes("fulfilled"),
      ).length,
      pendingOrders: orders.filter((order) =>
        order.fulfillmentStatus.toLowerCase().includes("unfulfilled"),
      ).length,
    };
  }

  private async searchOrders(query: string): Promise<OrderLookupResult[]> {
    const cacheKey = `orders:${query}`;
    const cached = getCached<OrderLookupResult[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const data = await this.graphql<{
      orders: {
        edges: Array<{ node: OrderSearchNode }>;
      };
    }>(
      `
        query SearchOrders($query: String!) {
          orders(first: 5, query: $query, sortKey: PROCESSED_AT, reverse: true) {
            edges {
              node {
                id
                legacyResourceId
                name
                orderNumber
                displayFinancialStatus
                displayFulfillmentStatus
                createdAt
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                customer {
                  phone
                  email
                  displayName
                }
                shippingAddress {
                  phone
                  name
                  address1
                  city
                  province
                  country
                  zip
                }
                lineItems(first: 20) {
                  edges {
                    node {
                      title
                      quantity
                      sku
                      variantTitle
                      discountedTotalSet {
                        shopMoney {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
                fulfillments {
                  status
                  trackingInfo {
                    company
                    number
                    url
                  }
                }
              }
            }
          }
        }
      `,
      { query },
    );

    const orders = data.orders.edges.map(({ node }) => this.mapOrder(node));
    return setCached(cacheKey, orders);
  }

  private mapOrder(node: OrderSearchNode): OrderLookupResult {
    return {
      id: node.legacyResourceId,
      gid: node.id,
      orderName: node.name,
      orderNumber: String(node.orderNumber),
      financialStatus: node.displayFinancialStatus,
      fulfillmentStatus: node.displayFulfillmentStatus,
      createdAt: node.createdAt,
      totalAmount: node.totalPriceSet.shopMoney.amount,
      currencyCode: node.totalPriceSet.shopMoney.currencyCode,
      customerName: node.customer?.displayName ?? null,
      customerEmail: node.customer?.email ?? null,
      customerPhone: node.customer?.phone ?? null,
      shippingPhone: node.shippingAddress?.phone ?? null,
      shippingAddress: node.shippingAddress
        ? [
            node.shippingAddress.name,
            node.shippingAddress.address1,
            node.shippingAddress.city,
            node.shippingAddress.province,
            node.shippingAddress.country,
            node.shippingAddress.zip,
          ]
            .filter(Boolean)
            .join(", ")
        : null,
      tracking: node.fulfillments.flatMap((fulfillment) =>
        fulfillment.trackingInfo.map((tracking) => ({
          company: tracking.company ?? null,
          number: tracking.number ?? null,
          url: tracking.url ?? null,
          status: fulfillment.status ?? null,
        })),
      ),
      lineItems: node.lineItems.edges.map(({ node: lineItem }) => ({
        title: lineItem.title,
        quantity: lineItem.quantity,
        sku: lineItem.sku ?? null,
        variantTitle: lineItem.variantTitle ?? null,
        total: lineItem.discountedTotalSet.shopMoney.amount,
        currencyCode: lineItem.discountedTotalSet.shopMoney.currencyCode,
      })),
    };
  }

  private async graphql<TData>(query: string, variables: Record<string, unknown>): Promise<TData> {
    if (!config.shopify.adminDomain || !config.shopify.accessToken) {
      throw new Error("Shopify Admin API credentials are not configured.");
    }

    if (!config.shopify.adminDomain.endsWith(".myshopify.com")) {
      throw new Error(
        "Shopify Admin API must use your shop's .myshopify.com admin domain. Set SHOPIFY_ADMIN_DOMAIN in .env.",
      );
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": config.shopify.accessToken,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          "Shopify Admin API authentication failed. Check SHOPIFY_ADMIN_DOMAIN and SHOPIFY_ADMIN_API_ACCESS_TOKEN.",
        );
      }

      throw new Error(`Shopify API request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as GraphQlResponse<TData>;
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message).join("; "));
    }

    if (!payload.data) {
      throw new Error("Shopify API returned no data.");
    }

    return payload.data;
  }
}

export const shopifyService = new ShopifyService();
