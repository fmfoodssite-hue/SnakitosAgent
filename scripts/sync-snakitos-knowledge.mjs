import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const STORE_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || "snakitos.com";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`${name} is required to sync Snakitos knowledge.`);
  }
}

function stripHtml(value) {
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

function xmlLocs(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

function productDocument(product) {
  const variants = (product.variants || [])
    .map((variant) => {
      const parts = [
        variant.title && variant.title !== "Default Title" ? `Variant: ${variant.title}` : "",
        variant.price ? `Price: PKR ${variant.price}` : "",
        variant.sku ? `SKU: ${variant.sku}` : "",
      ].filter(Boolean);
      return parts.join(" | ");
    })
    .filter(Boolean);

  const sections = [
    `Product Title: ${product.title}`,
    `Handle: ${product.handle}`,
    product.vendor ? `Vendor: ${product.vendor}` : "",
    product.product_type ? `Category: ${product.product_type}` : "",
    product.tags ? `Tags: ${product.tags}` : "",
    stripHtml(product.body_html || ""),
    variants.length ? `Variants: ${variants.join(" || ")}` : "",
  ].filter(Boolean);

  return {
    title: product.title,
    content: sections.join("\n"),
    source: "snakitos:product",
  };
}

function pageDocument(title, url, body) {
  return {
    title,
    content: [`Page: ${title}`, `URL: ${url}`, body].filter(Boolean).join("\n"),
    source: "snakitos:page",
  };
}

async function policyDocument(url) {
  const html = await fetchText(url);
  const title = html.match(/<title>\s*([^<]+?)\s*&ndash;/i)?.[1]?.trim() || url;
  const body = stripHtml(html)
    .replace(/^.*?(Shipping policy|Refund policy|Contact information)/i, "$1")
    .slice(0, 6000);

  return pageDocument(title, url, body);
}

async function contactDocument(url) {
  const html = await fetchText(url);
  const title = html.match(/<title>\s*([^<]+?)\s*&ndash;/i)?.[1]?.trim() || "Contact";
  const body = stripHtml(html).slice(0, 4000);
  return pageDocument(title, url, body);
}

async function collectionDocuments(domain) {
  const sitemap = await fetchText(`https://${domain}/sitemap_collections_1.xml?from=320887718048&to=340876558496`);
  return xmlLocs(sitemap).map((url) => {
    const slug = url.split("/collections/")[1] || "";
    const title = slug
      .split("?")[0]
      .split("-")
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" ");

    return {
      title: `Collection: ${title || "Store Collection"}`,
      content: `Snakitos collection available at ${url}. Collection handle: ${slug}.`,
      source: "snakitos:collection",
    };
  });
}

async function main() {
  requireEnv("SUPABASE_URL", SUPABASE_URL);
  requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const productsPayload = await fetchJson(`https://${STORE_DOMAIN}/products.json?limit=250`);
  const products = (productsPayload.products || []).map(productDocument);
  const collections = await collectionDocuments(STORE_DOMAIN);
  const policies = await Promise.all([
    policyDocument(`https://${STORE_DOMAIN}/policies/shipping-policy`),
    policyDocument(`https://${STORE_DOMAIN}/policies/refund-policy`),
    contactDocument(`https://${STORE_DOMAIN}/pages/contact`),
  ]);

  const storeOverview = {
    title: "Snakitos Store Overview",
    content: [
      `Store domain: ${STORE_DOMAIN}`,
      `This knowledge base was synced from the live Snakitos Shopify storefront.`,
      `The store currently exposes ${products.length} products in the public Shopify product feed.`,
      `Collections include deals, bundle, nachos, banana chips, multi grain, patata chips, sweet tooth, mega discounts, and more.`,
      `Use this knowledge to answer questions about snacks, deals, bundles, products, contact page, shipping policy, and refund policy.`,
    ].join("\n"),
    source: "snakitos:overview",
  };

  const documents = [storeOverview, ...policies, ...collections, ...products];

  const { error: deleteError } = await supabase
    .from("knowledge_documents")
    .delete()
    .like("source", "snakitos:%");

  if (deleteError) {
    throw deleteError;
  }

  const { error: insertError } = await supabase
    .from("knowledge_documents")
    .insert(documents);

  if (insertError) {
    throw insertError;
  }

  console.log(`Synced ${documents.length} Snakitos knowledge documents.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
