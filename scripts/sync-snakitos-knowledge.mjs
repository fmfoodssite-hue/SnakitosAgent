import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";

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

async function loadLocalCategoryKnowledge() {
  const filePath = path.resolve(
    process.cwd(),
    "apps/chatbot/src/server/data/category-knowledge.json",
  );
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("category-knowledge.json must contain a top-level array.");
  }

  return parsed.map((item) => ({
    title: item.name || item.title || "Category Knowledge",
    content: item.description || item.content || "",
    sourceType: "shopify",
    summary: `snakitos:category:${item.category || "general"}`,
  }));
}

async function loadCapabilityKnowledge() {
  const filePath = path.resolve(
    process.cwd(),
    "apps/chatbot/src/server/data/capability-knowledge.json",
  );
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("capability-knowledge.json must contain a top-level array.");
  }

  return parsed.map((item) => ({
    title: item.name || item.title || "Capability Knowledge",
    content: item.description || item.content || "",
    sourceType: "shopify",
    summary: `snakitos:capability:${item.category || "general"}`,
  }));
}

async function loadSnakitosRagPack() {
  const basePath = path.resolve(
    process.cwd(),
    "apps/chatbot/src/server/data/snakitos-rag-pack",
  );

  const [generalTrainingRaw, faqRaw, recommendationsRaw, productRecordsRaw] = await Promise.all([
    fs.readFile(path.join(basePath, "01-general-query-training-dataset.json"), "utf8"),
    fs.readFile(path.join(basePath, "02-product-faq-dataset.json"), "utf8"),
    fs.readFile(path.join(basePath, "03-product-recommendation-dataset.json"), "utf8"),
    fs.readFile(path.join(basePath, "15-product-records.json"), "utf8"),
  ]);

  const generalTraining = JSON.parse(generalTrainingRaw);
  const faqs = JSON.parse(faqRaw);
  const recommendations = JSON.parse(recommendationsRaw);
  const productRecords = JSON.parse(productRecordsRaw);

  return [
    ...generalTraining.map((item) => ({
      title: `Training: ${item.intent || "general"}`,
      content: [item.user_query, item.ideal_answer, item.follow_up_question]
        .filter(Boolean)
        .join("\n"),
      sourceType: "shopify",
      summary: `snakitos:training:${item.intent || "general"}`,
    })),
    ...faqs.map((item) => ({
      title: item.question || "Snakitos FAQ",
      content: [
        `Category: ${item.category || "general"}`,
        item.answer || "",
        item.safe_upsell ? `Safe upsell: ${item.safe_upsell}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      sourceType: "shopify",
      summary: `snakitos:faq:${(item.category || "general").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    })),
    ...recommendations.map((item) => ({
      title: `Recommendation: ${item.trigger_type || "general"} ${item.trigger_value || ""}`.trim(),
      content: [
        `Trigger type: ${item.trigger_type || ""}`,
        `Trigger value: ${item.trigger_value || ""}`,
        Array.isArray(item.primary_recommendations)
          ? `Primary: ${item.primary_recommendations.join(", ")}`
          : "",
        Array.isArray(item.bundle_priority)
          ? `Bundles: ${item.bundle_priority.join(", ")}`
          : "",
        item.balancing_add_on ? `Add-on: ${item.balancing_add_on}` : "",
        item.follow_up_question || "",
      ]
        .filter(Boolean)
        .join("\n"),
      sourceType: "shopify",
      summary: `snakitos:recommendation:${item.trigger_type || "general"}`,
    })),
    ...productRecords.map((item) => ({
      title: item.product_name || "Snakitos Product Record",
      content: [
        `Category: ${item.category || ""}`,
        `Flavor: ${item.flavor_type || ""}`,
        Array.isArray(item.taste_tags) ? `Taste tags: ${item.taste_tags.join(", ")}` : "",
        Array.isArray(item.occasion_tags) ? `Occasion tags: ${item.occasion_tags.join(", ")}` : "",
        Array.isArray(item.price_tags) ? `Price tags: ${item.price_tags.join(", ")}` : "",
        item.bundle_upgrade ? `Bundle upgrade: ${item.bundle_upgrade}` : "",
        Array.isArray(item.cross_sell_products)
          ? `Cross-sell: ${item.cross_sell_products.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      sourceType: "shopify",
      summary: `snakitos:product-record:${(item.category || "general").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    })),
  ];
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
    sourceType: "shopify",
    summary: "snakitos:product",
  };
}

function pageDocument(title, url, body) {
  return {
    title,
    content: [`Page: ${title}`, `URL: ${url}`, body].filter(Boolean).join("\n"),
    sourceType: "shopify",
    summary: "snakitos:page",
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
      sourceType: "shopify",
      summary: "snakitos:collection",
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
  const localCategoryKnowledge = await loadLocalCategoryKnowledge();
  const capabilityKnowledge = await loadCapabilityKnowledge();
  const snakitosRagPack = await loadSnakitosRagPack();

  const storeOverview = {
    title: "Snakitos Store Overview",
    content: [
      `Store domain: ${STORE_DOMAIN}`,
      `This knowledge base was synced from the live Snakitos Shopify storefront.`,
      `The store currently exposes ${products.length} products in the public Shopify product feed.`,
      `Collections include deals, bundle, nachos, banana chips, multi grain, patata chips, sweet tooth, mega discounts, and more.`,
      `Use this knowledge to answer questions about snacks, deals, bundles, products, contact page, shipping policy, and refund policy.`,
    ].join("\n"),
    sourceType: "shopify",
    summary: "snakitos:overview",
  };

  const documents = [
    storeOverview,
    ...localCategoryKnowledge,
    ...capabilityKnowledge,
    ...snakitosRagPack,
    ...policies,
    ...collections,
    ...products,
  ];

  const { error: deleteError } = await supabase
    .from("knowledge_documents")
    .delete()
    .eq("source_type", "shopify");

  if (deleteError) {
    throw deleteError;
  }

  const { error: insertError } = await supabase
    .from("knowledge_documents")
    .insert(
      documents.map((doc) => ({
        title: doc.title,
        content: doc.content,
        source_type: doc.sourceType ?? "shopify",
        status: "indexed",
        summary: doc.summary ?? null,
      })),
    );

  if (insertError) {
    throw insertError;
  }

  console.log(`Synced ${documents.length} Snakitos knowledge documents.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
