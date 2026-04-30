import path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function getEnv(name) {
  return (process.env[name] ?? "").trim();
}

function normalizeStorefrontDomain(value) {
  return (value || "snakitos.com").replace(/^https?:\/\//i, "").replace(/\/+$/g, "") || "snakitos.com";
}

function toAbsoluteStoreUrl(pathOrUrl, storefrontDomain) {
  const cleaned = String(pathOrUrl ?? "").trim();
  if (!cleaned) {
    return "";
  }

  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }

  const domain = normalizeStorefrontDomain(storefrontDomain);
  return `https://${domain}${cleaned.startsWith("/") ? cleaned : `/${cleaned}`}`;
}

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.log("Usage: npm run query:rag -- \"your query\"");
    process.exit(1);
  }

  const openAiApiKey = getEnv("OPENAI_API_KEY");
  const pineconeApiKey = getEnv("PINECONE_API_KEY");
  const pineconeIndexName = getEnv("PINECONE_INDEX");
  const pineconeNamespace = getEnv("PINECONE_NAMESPACE");
  const storefrontDomain = getEnv("SHOPIFY_SHOP_DOMAIN") || "snakitos.com";

  if (!openAiApiKey || !pineconeApiKey || !pineconeIndexName) {
    throw new Error("OPENAI_API_KEY, PINECONE_API_KEY, and PINECONE_INDEX are required.");
  }

  if (/^https?:\/\//i.test(pineconeApiKey)) {
    throw new Error("PINECONE_API_KEY looks like a host URL. Put the real Pinecone API key in PINECONE_API_KEY.");
  }

  const openai = new OpenAI({ apiKey: openAiApiKey });
  const pc = new Pinecone({ apiKey: pineconeApiKey });
  const index = pc.index(pineconeIndexName);
  const scopedIndex = pineconeNamespace ? index.namespace(pineconeNamespace) : index;

  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: [query],
  });

  const response = await scopedIndex.query({
    vector: embeddingResponse.data[0].embedding,
    topK: 5,
    includeMetadata: true,
  });

  const results = response.matches
    .map((match) => {
      const metadata = match.metadata || {};
      const type = typeof metadata.type === "string" ? metadata.type : "knowledge";
      const fallbackPath = type === "product" ? "/collections/all" : "/policies/";
      return {
        name: typeof metadata.name === "string" ? metadata.name : "Knowledge",
        text: typeof metadata.text === "string" ? metadata.text : "",
        link: toAbsoluteStoreUrl(metadata.link || fallbackPath, storefrontDomain),
      };
    })
    .filter((item) => item.text);

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
