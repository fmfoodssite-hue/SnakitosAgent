import { readFile } from "fs/promises";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
export const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_STOREFRONT_DOMAIN = "snakitos.com";
const PRODUCT_FALLBACK_PATH = "/collections/all";
const POLICY_FALLBACK_PATH = "/pages/policies";
const MAX_CHUNK_LENGTH = 900;
const CHUNK_OVERLAP = 120;
const UPSERT_BATCH_SIZE = 100;
const openAiClients = new Map();
const pineconeClients = new Map();
function getOpenAiClient(apiKey) {
    const normalizedApiKey = apiKey.trim();
    if (!normalizedApiKey) {
        throw new Error("OPENAI_API_KEY is required for embedding generation.");
    }
    const cached = openAiClients.get(normalizedApiKey);
    if (cached) {
        return cached;
    }
    const client = new OpenAI({ apiKey: normalizedApiKey });
    openAiClients.set(normalizedApiKey, client);
    return client;
}
function getPineconeClient(apiKey) {
    const normalizedApiKey = apiKey.trim();
    if (!normalizedApiKey) {
        throw new Error("PINECONE_API_KEY is required for Pinecone access.");
    }
    if (/^https?:\/\//i.test(normalizedApiKey)) {
        throw new Error("PINECONE_API_KEY looks like a host URL. Set PINECONE_API_KEY to the real API key and PINECONE_HOST to the index host if needed.");
    }
    const cached = pineconeClients.get(normalizedApiKey);
    if (cached) {
        return cached;
    }
    const client = new Pinecone({ apiKey: normalizedApiKey });
    pineconeClients.set(normalizedApiKey, client);
    return client;
}
function cleanText(value) {
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
function coerceString(value) {
    return typeof value === "string" ? cleanText(value) : "";
}
function normalizeStorefrontDomain(value) {
    return (value ?? DEFAULT_STOREFRONT_DOMAIN)
        .replace(/^https?:\/\//i, "")
        .replace(/\/+$/g, "")
        .trim() || DEFAULT_STOREFRONT_DOMAIN;
}
function toAbsoluteStoreUrl(pathOrUrl, storefrontDomain) {
    const cleaned = pathOrUrl.trim();
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
    const normalizedType = type.trim().toLowerCase();
    const path = normalizedType === "product" ? PRODUCT_FALLBACK_PATH : POLICY_FALLBACK_PATH;
    return toAbsoluteStoreUrl(path, storefrontDomain);
}
function resolveLink(link, type, storefrontDomain) {
    return link ? toAbsoluteStoreUrl(link, storefrontDomain) : resolveFallbackLink(type, storefrontDomain);
}
function inferName(item) {
    return coerceString(item.name) || coerceString(item.title) || coerceString(item.id) || "Knowledge";
}
function inferType(item) {
    return coerceString(item.type).toLowerCase() || "knowledge";
}
function inferCategory(item) {
    return coerceString(item.category).toLowerCase();
}
function extractMeaningfulBody(item) {
    return coerceString(item.description) || coerceString(item.text) || coerceString(item.content);
}
function toSentence(value) {
    return /[.!?]$/.test(value) ? value : `${value}.`;
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
export function buildSemanticText(item) {
    const name = inferName(item);
    const type = inferType(item);
    const category = inferCategory(item);
    const body = extractMeaningfulBody(item);
    const categoryPhrase = category ? ` in the ${category} category` : "";
    if (!body) {
        if (type === "product") {
            return `${name} is a Snakitos product${categoryPhrase}.`;
        }
        if (type === "policy") {
            return `${name} is a Snakitos policy document${categoryPhrase}.`;
        }
        return `${name} is a Snakitos knowledge entry${categoryPhrase}.`;
    }
    if (type === "product") {
        return `${name} is ${body}${categoryPhrase ? `${categoryPhrase}` : ""}, ideal for shoppers exploring Snakitos products.`
            .replace(/\s+,/g, ",")
            .replace(/\s+/g, " ")
            .trim();
    }
    if (type === "policy") {
        return `${name} explains the following Snakitos policy details: ${toSentence(body)}`;
    }
    if (type === "faq") {
        return `${name} answers this frequently asked question: ${toSentence(body)}`;
    }
    if (type === "intent") {
        return `${name} captures this shopper intent or support knowledge: ${toSentence(body)}`;
    }
    return `${name}${categoryPhrase} contains this Snakitos knowledge: ${toSentence(body)}`;
}
export function prepareKnowledgeRecords(items, storefrontDomain) {
    return items.flatMap((item, itemIndex) => {
        const id = coerceString(item.id) || `knowledge-${itemIndex + 1}`;
        const name = inferName(item);
        const type = inferType(item);
        const category = inferCategory(item);
        const link = resolveLink(coerceString(item.link), type, storefrontDomain);
        const semanticText = buildSemanticText(item);
        const chunks = type === "product" ? [semanticText] : splitTextIntoChunks(semanticText);
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
export async function readKnowledgeJsonFile(filePath) {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error("Knowledge JSON file must contain a top-level array.");
    }
    return parsed;
}
export async function createEmbeddings(apiKey, input) {
    if (input.length === 0) {
        return [];
    }
    const response = await getOpenAiClient(apiKey).embeddings.create({
        model: EMBEDDING_MODEL,
        input,
    });
    return response.data
        .slice()
        .sort((left, right) => left.index - right.index)
        .map((item) => item.embedding);
}
async function getPineconeIndex(runtimeConfig) {
    const pineconeIndexName = runtimeConfig.pineconeIndexName.trim();
    if (!pineconeIndexName) {
        throw new Error("PINECONE_INDEX is required for Pinecone access.");
    }
    const client = getPineconeClient(runtimeConfig.pineconeApiKey);
    const host = runtimeConfig.pineconeHost?.trim();
    const index = host
        ? client.index({ name: pineconeIndexName, host })
        : client.index(pineconeIndexName);
    return runtimeConfig.pineconeNamespace?.trim()
        ? index.namespace(runtimeConfig.pineconeNamespace.trim())
        : index;
}
export async function ingestKnowledgeItems(options) {
    const { items, runtimeConfig, replaceNamespace = false } = options;
    const records = prepareKnowledgeRecords(items, runtimeConfig.storefrontDomain);
    const index = await getPineconeIndex(runtimeConfig);
    if (replaceNamespace) {
        await index.deleteAll();
    }
    for (let start = 0; start < records.length; start += UPSERT_BATCH_SIZE) {
        const batch = records.slice(start, start + UPSERT_BATCH_SIZE);
        const embeddings = await createEmbeddings(runtimeConfig.openAiApiKey, batch.map((record) => record.text));
        const upsertBatch = batch.map((record, indexInBatch) => ({
            id: record.id,
            values: embeddings[indexInBatch],
            metadata: record.metadata,
        }));
        await index.upsert({
            records: upsertBatch,
        });
    }
    return { recordCount: records.length };
}
export async function ingestKnowledgeFile(options) {
    const items = await readKnowledgeJsonFile(options.filePath);
    const result = await ingestKnowledgeItems({
        items,
        runtimeConfig: options.runtimeConfig,
        replaceNamespace: options.replaceNamespace,
    });
    return {
        itemCount: items.length,
        recordCount: result.recordCount,
    };
}
export async function retrieveKnowledge(options) {
    const query = options.query.trim();
    if (!query) {
        return [];
    }
    const [queryEmbedding] = await createEmbeddings(options.runtimeConfig.openAiApiKey, [query]);
    const index = await getPineconeIndex(options.runtimeConfig);
    const response = await index.query({
        vector: queryEmbedding,
        topK: options.topK ?? 5,
        includeMetadata: true,
    });
    return response.matches
        .map((match) => {
        const metadata = match.metadata;
        if (!metadata) {
            return null;
        }
        const type = typeof metadata.type === "string" ? metadata.type : "knowledge";
        const name = typeof metadata.name === "string" ? metadata.name : "Knowledge";
        const category = typeof metadata.category === "string" ? metadata.category : "";
        const text = typeof metadata.text === "string" ? metadata.text : "";
        const link = resolveLink(typeof metadata.link === "string" ? metadata.link : "", type, options.runtimeConfig.storefrontDomain);
        if (!text) {
            return null;
        }
        return {
            id: match.id,
            name,
            text,
            link,
            type,
            category,
            score: match.score,
        };
    })
        .filter((item) => Boolean(item));
}
export function toStructuredKnowledgeContext(items) {
    return items.map((item) => ({
        name: item.name,
        text: item.text,
        link: item.link,
    }));
}
