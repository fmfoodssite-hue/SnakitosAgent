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

type ShopifyAccessTokenResponse = {
  access_token: string;
  scope: string;
  expires_in: number;
};

type StorefrontProductsResponse = {
  products: Array<{
    id: number;
    title: string;
    handle: string;
    status?: string;
    tags?: string;
    vendor?: string;
    product_type?: string;
    body_html?: string;
    variants?: Array<{
      id: number;
      title: string;
      sku: string | null;
      price: string;
      available?: boolean;
    }>;
  }>;
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
  private tokenCache: {
    token: string;
    expiresAt: number;
  } | null = null;

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

    let products: ProductLookupResult[];

    try {
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

      products = data.products.edges.map(({ node }) => ({
        id: node.legacyResourceId,
        title: node.title,
        handle: node.handle,
        status: node.status,
        price: node.variants.edges[0]?.node.price ?? null,
        description: null,
        vendor: null,
        productType: null,
        tags: [],
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
    } catch (error) {
      if (!this.shouldUseStorefrontFallback(error)) {
        throw error;
      }

      products = await this.searchProductsViaStorefront(trimmed);
    }

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

  async getStorefrontRecommendations(query: string, limit = 5): Promise<ProductLookupResult[]> {
    const products = await this.getStorefrontCatalog();
    const normalizedQuery = this.normalizeSearchText(query);
    const queryTokens = normalizedQuery.split(" ").filter(Boolean);
    const isDealsRequest = /(deal|bundle|combo|offer|offers)/i.test(query);
    const isMovieRequest = /(movie|night|party|sharing|family)/i.test(query);
    const isPopularRequest = /(best|selling|seller|popular|top|featured)/i.test(query);

    const scored = products
      .map((product) => {
        const haystack = this.normalizeSearchText(
          [
            product.title,
            product.handle,
            product.status,
            product.variants.map((variant) => variant.title).join(" "),
          ].join(" "),
        );

        let score = 0;
        for (const token of queryTokens) {
          if (haystack.includes(token)) {
            score += 3;
          }
        }

        if (isDealsRequest && /(deal|bundle|combo|pack|box)/i.test(product.title)) {
          score += 5;
        }

        if (isMovieRequest && /(nachos|bundle|pack|combo|chips|snack)/i.test(product.title)) {
          score += 4;
        }

        if (isPopularRequest && /(mega|ultimate|fiesta|deal|bundle|nachos|snack)/i.test(product.title)) {
          score += 2;
        }

        if (/(nachos|movie|party|sharing|bundle|deal|combo|snack|chips)/i.test(product.description || "")) {
          score += 1;
        }

        if (product.price) {
          score += 1;
        }

        return { product, score };
      })
      .filter((item) => item.score > 0 || queryTokens.length === 0 || isPopularRequest)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((item) => item.product);

    return scored;
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
    if (
      !config.shopify.adminDomain ||
      (!config.shopify.accessToken &&
        !(config.shopify.clientId && config.shopify.clientSecret))
    ) {
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
        "X-Shopify-Access-Token": await this.getAdminAccessToken(),
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          "Shopify Admin API authentication failed. Check SHOPIFY_ADMIN_DOMAIN and either SHOPIFY_ADMIN_API_ACCESS_TOKEN or SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET.",
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

  private async getAdminAccessToken(): Promise<string> {
    if (config.shopify.accessToken) {
      return config.shopify.accessToken;
    }

    if (config.shopify.clientId && config.shopify.clientSecret) {
      if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 60_000) {
        return this.tokenCache.token;
      }

      const tokenEndpoint = `https://${config.shopify.adminDomain}/admin/oauth/access_token`;
      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: config.shopify.clientId,
          client_secret: config.shopify.clientSecret,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Shopify token exchange failed with status ${response.status}. Check SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.`,
        );
      }

      const payload = (await response.json()) as ShopifyAccessTokenResponse;
      this.tokenCache = {
        token: payload.access_token,
        expiresAt: Date.now() + payload.expires_in * 1000,
      };

      return payload.access_token;
    }

    throw new Error("Shopify Admin API credentials are not configured.");
  }

  private shouldUseStorefrontFallback(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes("authentication failed") ||
      message.includes("invalid api key or access token") ||
      message.includes("credentials are not configured")
    );
  }

  private async searchProductsViaStorefront(query: string): Promise<ProductLookupResult[]> {
    const products = await this.getStorefrontCatalog();
    const normalizedQuery = this.normalizeSearchText(query);

    const matches = products.filter((product) => {
      const haystack = this.normalizeSearchText(
        [
          product.title,
          product.handle,
          product.status,
          product.description,
          product.vendor,
          product.productType,
          product.tags.join(" "),
          product.variants.map((variant) => variant.title).join(" "),
        ]
          .filter(Boolean)
          .join(" "),
      );
      const queryTokens = normalizedQuery.split(" ").filter(Boolean);
      const score = queryTokens.reduce((count, token) => {
        return haystack.includes(token) ? count + 1 : count;
      }, 0);

      return queryTokens.length > 0 && score >= Math.max(1, Math.min(2, queryTokens.length - 1));
    });

    return matches.slice(0, 5);
  }

  private async getStorefrontCatalog(): Promise<ProductLookupResult[]> {
    if (!config.shopify.storefrontDomain) {
      throw new Error(
        "Shopify product catalog is unavailable because SHOPIFY_SHOP_DOMAIN is not configured.",
      );
    }

    const cacheKey = `storefront-catalog:${config.shopify.storefrontDomain}`;
    const cached = getCached<ProductLookupResult[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await fetch(
      `https://${config.shopify.storefrontDomain}/products.json?limit=250`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Shopify storefront catalog request failed with status ${response.status}.`,
      );
    }

    const payload = (await response.json()) as StorefrontProductsResponse;
    const catalog: ProductLookupResult[] = payload.products.map((product) => {
      const variants = (product.variants ?? []).map((variant) => ({
        id: String(variant.id),
        title: variant.title,
        price: variant.price,
        sku: variant.sku,
        inventoryQuantity: null,
      }));
      const variantAvailability = (product.variants ?? [])
        .map((variant) => variant.available)
        .filter((value): value is boolean => typeof value === "boolean");
      const hasAvailableVariant = (product.variants ?? []).some((variant) => variant.available);

      return {
        id: String(product.id),
        title: product.title,
        handle: product.handle,
        status: (product.status ?? "active").toUpperCase(),
        price: variants[0]?.price ?? null,
        description: product.body_html ? this.stripHtml(product.body_html) : null,
        vendor: product.vendor ?? null,
        productType: product.product_type ?? null,
        tags: product.tags
          ? product.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
          : [],
        availability:
          variantAvailability.length === 0
            ? "unknown"
            : hasAvailableVariant
              ? "in_stock"
              : "out_of_stock",
        totalInventory: null,
        variants,
      };
    });

    return setCached(cacheKey, catalog, 10 * DEFAULT_TTL_MS);
  }

  private normalizeSearchText(value: string): string {
    return value
      .toLowerCase()
      .replace(/<[^>]+>/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  private stripHtml(value: string): string {
    return value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
  }
}

export const shopifyService = new ShopifyService();
