import { Pinecone } from "@pinecone-database/pinecone";
import { randomUUID } from "crypto";
import { config } from "../config";
import { KnowledgeDocument } from "../types/chat.types";
import { supabaseService } from "./supabase.service";

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 5);
}

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type StorefrontProduct = {
  title: string;
  handle: string;
  tags?: string;
  vendor?: string;
  product_type?: string;
  body_html?: string;
};

const cache = new Map<string, CacheEntry<unknown>>();
const STORE_KNOWLEDGE_TTL_MS = 10 * 60 * 1000;

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

function setCached<T>(key: string, value: T, ttlMs = STORE_KNOWLEDGE_TTL_MS): T {
  cache.set(key, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
  return value;
}

function stripHtml(value: string): string {
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

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&ndash;/gi, "-")
    .replace(/&mdash;/gi, "-");
}

function toAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return `https://${config.shopify.storefrontDomain}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

export class KnowledgeService {
  private pinecone: Pinecone | null;

  constructor() {
    this.pinecone = config.pinecone.apiKey ? new Pinecone({ apiKey: config.pinecone.apiKey }) : null;
  }

  async retrieve(query: string): Promise<KnowledgeDocument[]> {
    const [supabaseMatches, pineconeMatches, storefrontMatches] = await Promise.all([
      this.searchSupabase(query),
      this.searchPinecone(query),
      this.searchStorefront(query),
    ]);

    const merged = [...storefrontMatches, ...supabaseMatches];
    for (const match of [...pineconeMatches]) {
      if (!merged.find((item) => item.content === match.content)) {
        merged.push(match);
      }
    }

    return merged.slice(0, 5);
  }

  private async searchSupabase(query: string): Promise<KnowledgeDocument[]> {
    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) {
      return [];
    }

    const filters = tokens
      .map((token) => `title.ilike.%${token}%,content.ilike.%${token}%`)
      .join(",");

    try {
      const { data, error } = await supabaseService.client
        .from("knowledge_documents")
        .select("id,title,content,source")
        .or(filters)
        .limit(5);

      if (error || !data) {
        return [];
      }

      return data.map((item) => ({
        id: item.id,
        title: item.title ?? "Knowledge",
        content: item.content ?? "",
        source: item.source ?? "supabase",
      }));
    } catch {
      return [];
    }
  }

  private async searchPinecone(query: string): Promise<KnowledgeDocument[]> {
    if (!this.pinecone || !config.pinecone.indexName || !query.trim()) {
      return [];
    }

    try {
      const index = this.pinecone.index(config.pinecone.indexName);
      const searchRecords = (index as unknown as {
        searchRecords?: (input: {
          query: { inputs: { text: string }, topK: number };
          namespace?: string;
          fields?: string[];
        }) => Promise<{
          result?: {
            hits?: Array<{
              _id?: string;
              fields?: Record<string, unknown>;
            }>;
          };
        }>;
      }).searchRecords;

      if (!searchRecords) {
        return [];
      }

      const response = await searchRecords.call(index, {
        query: {
          inputs: {
            text: query,
          },
          topK: 5,
        },
        namespace: config.pinecone.namespace || undefined,
        fields: ["title", "content", "source"],
      });

      return (
        response.result?.hits?.map((hit) => ({
          id: hit._id ?? randomUUID(),
          title: String(hit.fields?.title ?? "Knowledge"),
          content: String(hit.fields?.content ?? ""),
          source: String(hit.fields?.source ?? "pinecone"),
        })) ?? []
      );
    } catch {
      return [];
    }
  }

  private async searchStorefront(query: string): Promise<KnowledgeDocument[]> {
    if (!config.shopify.storefrontDomain || !query.trim()) {
      return [];
    }

    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) {
      return [];
    }

    try {
      const documents = await this.getStorefrontKnowledgeDocuments();
      const matches = documents
        .map((document) => ({
          document,
          score: tokens.reduce((count, token) => {
            const haystack = `${document.title} ${document.content}`.toLowerCase();
            return haystack.includes(token) ? count + 1 : count;
          }, 0),
        }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 5)
        .map((item) => item.document);

      return matches;
    } catch {
      return [];
    }
  }

  private async fetchHtmlKnowledgeDocument(
    url: string,
    fallbackTitle: string,
    source: string,
    maxLength = 5000,
  ): Promise<KnowledgeDocument> {
    const response = await fetch(url);
    const html = await response.text();
    const title =
      html.match(/<title>\s*([^<]+?)\s*&ndash;/i)?.[1]?.trim() ||
      html.match(/<title>\s*([^<]+?)\s*<\/title>/i)?.[1]?.trim() ||
      fallbackTitle;

    return {
      id: randomUUID(),
      title,
      content: stripHtml(html).slice(0, maxLength),
      source,
    };
  }

  private async fetchBlogDocuments(blogHtml: string): Promise<KnowledgeDocument[]> {
    const linkMatches = [...blogHtml.matchAll(/###\s*<a[^>]+href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/gi)];
    const uniqueLinks = Array.from(
      new Map(
        linkMatches.map((match) => [
          toAbsoluteUrl(match[1]),
          {
            url: toAbsoluteUrl(match[1]),
            title: decodeHtml(stripHtml(match[2])).trim(),
          },
        ]),
      ).values(),
    ).slice(0, 8);

    const articleDocs = await Promise.all(
      uniqueLinks.map(async ({ url, title }) => {
        try {
          const doc = await this.fetchHtmlKnowledgeDocument(
            url,
            `Snakitos Blog: ${title}`,
            "snakitos-blog",
            6000,
          );

          return {
            ...doc,
            title: doc.title.startsWith("Buy the Best")
              ? `Snakitos Blog: ${title}`
              : doc.title,
            content: [`Source URL: ${url}`, doc.content].join("\n"),
          };
        } catch {
          return {
            id: randomUUID(),
            title: `Snakitos Blog: ${title}`,
            content: `Source URL: ${url}`,
            source: "snakitos-blog",
          };
        }
      }),
    );

    return articleDocs;
  }

  private async getStorefrontKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
    const cacheKey = `storefront-knowledge:${config.shopify.storefrontDomain}`;
    const cached = getCached<KnowledgeDocument[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const [productsResponse, contactPage, complaintPage, shippingPolicy, refundPolicy, privacyPolicy, termsOfService, blogPage] = await Promise.all([
      fetch(`https://${config.shopify.storefrontDomain}/products.json?limit=250`),
      fetch(`https://${config.shopify.storefrontDomain}/pages/contact`),
      fetch(`https://${config.shopify.storefrontDomain}/pages/complaint-form`),
      fetch(`https://${config.shopify.storefrontDomain}/policies/shipping-policy`),
      fetch(`https://${config.shopify.storefrontDomain}/policies/refund-policy`),
      fetch(`https://${config.shopify.storefrontDomain}/policies/privacy-policy`),
      fetch(`https://${config.shopify.storefrontDomain}/policies/terms-of-service`),
      fetch(`https://${config.shopify.storefrontDomain}/blogs/blog`),
    ]);

    const productsPayload = (await productsResponse.json()) as {
      products?: StorefrontProduct[];
    };

    const products = (productsPayload.products ?? []).map((product) => ({
      id: randomUUID(),
      title: product.title,
      content: [
        `Store: ${config.shopify.storefrontDomain}`,
        `Handle: ${product.handle}`,
        product.vendor ? `Vendor: ${product.vendor}` : "",
        product.product_type ? `Category: ${product.product_type}` : "",
        product.tags ? `Tags: ${product.tags}` : "",
        stripHtml(product.body_html ?? ""),
      ]
        .filter(Boolean)
        .join("\n"),
      source: "snakitos-storefront",
    }));

    const policyPages = await Promise.all(
      [
        {
          response: contactPage,
          fallbackTitle: "Snakitos Contact Page",
        },
        {
          response: complaintPage,
          fallbackTitle: "Snakitos Complaint Form",
        },
        {
          response: shippingPolicy,
          fallbackTitle: "Snakitos Shipping Policy",
        },
        {
          response: refundPolicy,
          fallbackTitle: "Snakitos Refund Policy",
        },
        {
          response: privacyPolicy,
          fallbackTitle: "Snakitos Privacy Policy",
        },
        {
          response: termsOfService,
          fallbackTitle: "Snakitos Terms of Service",
        },
      ].map(async ({ response, fallbackTitle }) => {
        const html = await response.text();
        const title = html.match(/<title>\s*([^<]+?)\s*&ndash;/i)?.[1]?.trim() || fallbackTitle;
        return {
          id: randomUUID(),
          title,
          content: stripHtml(html).slice(0, 5000),
          source: "snakitos-storefront",
        };
      }),
    );

    const blogHtml = await blogPage.text();
    const blogEntries = await this.fetchBlogDocuments(blogHtml);

    const blogOverview: KnowledgeDocument = {
      id: randomUUID(),
      title: "Snakitos Blog Overview",
      content: [
        `Blog URL: https://${config.shopify.storefrontDomain}/blogs/blog`,
        "Recent blog topics include spicy snacks, tea-time snacks, healthy snacking, balanced snack plates, portable snacks, city-specific snack recommendations, and snack occasions.",
      ].join("\n"),
      source: "snakitos-blog",
    };

    const overview: KnowledgeDocument = {
      id: randomUUID(),
      title: "Snakitos Store Overview",
      content: [
        `Store domain: ${config.shopify.storefrontDomain}`,
        `Product count in live storefront feed: ${products.length}`,
        "The store offers snacks, deals, bundles, nachos, chips, banana chips, and related snack collections.",
      ].join("\n"),
      source: "snakitos-storefront",
    };

    return setCached(cacheKey, [overview, blogOverview, ...policyPages, ...blogEntries, ...products]);
  }
}

export const knowledgeService = new KnowledgeService();
