import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_CHUNK_LENGTH = 900;
const CHUNK_OVERLAP = 120;
const BATCH_SIZE = 100;

function usage() {
  console.log("Usage: npm run ingest:json -- <path-to-json> [--replace]");
}

function getEnv(name) {
  return (process.env[name] ?? "").trim();
}

function cleanText(value) {
  return String(value ?? "")
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

function stripSensitiveSalesLanguage(value) {
  return String(value ?? "")
    .replace(
      /Popular Snakitos product from uploaded order history\.\s*Sold in \d+ orders with \d+ units recorded\.?/gi,
      "",
    )
    .replace(/Sold in \d+ orders with \d+ units recorded\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStorefrontDomain(value) {
  return (value || "snakitos.com").replace(/^https?:\/\//i, "").replace(/\/+$/g, "") || "snakitos.com";
}

function toAbsoluteStoreUrl(pathOrUrl, storefrontDomain) {
  const cleaned = cleanText(pathOrUrl);
  if (!cleaned) {
    return "";
  }

  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }

  const domain = normalizeStorefrontDomain(storefrontDomain);
  return `https://${domain}${cleaned.startsWith("/") ? cleaned : `/${cleaned}`}`;
}

function resolveFallbackLink(type, storefrontDomain) {
  return type === "product"
    ? toAbsoluteStoreUrl("/collections/all", storefrontDomain)
    : toAbsoluteStoreUrl("/policies/", storefrontDomain);
}

function buildSemanticText(item) {
  const name = cleanText(item.name || item.title || item.id || "Knowledge");
  const description = stripSensitiveSalesLanguage(
    cleanText(item.description || item.text || item.content),
  );
  const category = cleanText(item.category || item.productType).toLowerCase();
  const explicitType = cleanText(item.type).toLowerCase();
  const type = explicitType || (item.title || item.productType || item.vendor ? "product" : "knowledge");
  const categoryPhrase = category ? ` in the ${category} category` : "";

  if (!description) {
    if (type === "product") {
      return `${name} is a Snakitos product${categoryPhrase}.`;
    }

    if (type === "policy") {
      return `${name} is a Snakitos policy document${categoryPhrase}.`;
    }

    return `${name} is a Snakitos knowledge entry${categoryPhrase}.`;
  }

  if (type === "product") {
    return `${name} is ${description}${categoryPhrase}, ideal for shoppers exploring Snakitos products.`
      .replace(/\s+,/g, ",")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (type === "policy") {
    return `${name} explains the following Snakitos policy details: ${/[.!?]$/.test(description) ? description : `${description}.`}`;
  }

  if (type === "faq") {
    return `${name} answers this frequently asked question: ${/[.!?]$/.test(description) ? description : `${description}.`}`;
  }

  if (type === "intent") {
    return `${name} captures this shopper intent or support knowledge: ${/[.!?]$/.test(description) ? description : `${description}.`}`;
  }

  return `${name}${categoryPhrase} contains this Snakitos knowledge: ${/[.!?]$/.test(description) ? description : `${description}.`}`;
}

function splitTextIntoChunks(text) {
  if (text.length <= MAX_CHUNK_LENGTH) {
    return [text];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(text.length, start + MAX_CHUNK_LENGTH);
    if (end < text.length) {
      const boundary = text.lastIndexOf(". ", end);
      if (boundary > start + 200) {
        end = boundary + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= text.length) {
      break;
    }

    start = Math.max(0, end - CHUNK_OVERLAP);
  }

  return chunks;
}

function prepareRecords(items, storefrontDomain) {
  return items.flatMap((item, itemIndex) => {
    const id = cleanText(item.id) || `knowledge-${itemIndex + 1}`;
    const name = cleanText(item.name || item.title || item.id || "Knowledge");
    const explicitType = cleanText(item.type).toLowerCase();
    const type = explicitType || (item.title || item.productType || item.vendor ? "product" : "knowledge");
    const category = cleanText(item.category || item.productType).toLowerCase();
    const semanticText = buildSemanticText(item);
    const chunks = type === "product" ? [semanticText] : splitTextIntoChunks(semanticText);
    const link = toAbsoluteStoreUrl(item.link, storefrontDomain) || resolveFallbackLink(type, storefrontDomain);

    return chunks.map((text, chunkIndex) => ({
      id: chunks.length === 1 ? id : `${id}#${chunkIndex + 1}`,
      text,
      metadata: {
        type,
        name,
        category,
        text,
        link,
      },
    }));
  });
}

async function main() {
  const filePathArg = process.argv[2];
  const replaceNamespace = process.argv.includes("--replace");

  if (!filePathArg) {
    usage();
    process.exit(1);
  }

  const openAiApiKey = getEnv("OPENAI_API_KEY");
  const pineconeApiKey = getEnv("PINECONE_API_KEY");
  const pineconeIndexName = getEnv("PINECONE_INDEX");
  const pineconeNamespace = getEnv("PINECONE_NAMESPACE");
  const storefrontDomain = getEnv("SHOPIFY_SHOP_DOMAIN") || "snakitos.com";

  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required.");
  }

  if (!pineconeApiKey) {
    throw new Error("PINECONE_API_KEY is required.");
  }

  if (/^https?:\/\//i.test(pineconeApiKey)) {
    throw new Error("PINECONE_API_KEY looks like a host URL. Put the real Pinecone API key in PINECONE_API_KEY.");
  }

  if (!pineconeIndexName) {
    throw new Error("PINECONE_INDEX is required.");
  }

  const absolutePath = path.resolve(process.cwd(), filePathArg);
  const raw = await fs.readFile(absolutePath, "utf8");
  const items = JSON.parse(raw);
  if (!Array.isArray(items)) {
    throw new Error("Knowledge JSON file must contain a top-level array.");
  }

  const records = prepareRecords(items, storefrontDomain);
  const openai = new OpenAI({ apiKey: openAiApiKey });
  const pc = new Pinecone({ apiKey: pineconeApiKey });
  const index = pc.index(pineconeIndexName);
  const scopedIndex = pineconeNamespace ? index.namespace(pineconeNamespace) : index;

  if (replaceNamespace) {
    await scopedIndex.deleteAll();
  }

  for (let start = 0; start < records.length; start += BATCH_SIZE) {
    const batch = records.slice(start, start + BATCH_SIZE);
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map((record) => record.text),
    });

    const embeddings = embeddingResponse.data
      .slice()
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);

    await scopedIndex.upsert({
      records: batch.map((record, batchIndex) => ({
        id: record.id,
        values: embeddings[batchIndex],
        metadata: record.metadata,
      })),
    });
  }

  console.log(`Ingested ${items.length} items into ${records.length} Pinecone records from ${absolutePath}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
