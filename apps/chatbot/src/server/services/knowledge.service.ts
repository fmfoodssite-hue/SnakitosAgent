import { retrieveKnowledge } from "@lib/pinecone";
import { config } from "../config";
import { KnowledgeDocument } from "../types/chat.types";

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 100;
const RETRIEVAL_TIMEOUT_MS = 1_800;

export class KnowledgeService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: KnowledgeDocument[] }
  >();

  async retrieve(query: string): Promise<KnowledgeDocument[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (
      !normalizedQuery ||
      !config.openai.apiKey ||
      !config.pinecone.apiKey ||
      !config.pinecone.indexName
    ) {
      return [];
    }

    const cached = this.cache.get(normalizedQuery);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      const results = await this.retrieveWithTimeout(normalizedQuery);

      const mapped = results.map((item) => ({
        id: item.id,
        name: item.name,
        text: item.text,
        link: item.link,
        type: item.type,
        category: item.category,
        source: "pinecone",
      }));

      this.setCache(normalizedQuery, mapped);
      return mapped;
    } catch {
      return [];
    }
  }

  private async retrieveWithTimeout(query: string) {
    return await Promise.race([
      retrieveKnowledge({
        query,
        topK: 5,
        runtimeConfig: {
          openAiApiKey: config.openai.apiKey,
          pineconeApiKey: config.pinecone.apiKey,
          pineconeIndexName: config.pinecone.indexName,
          pineconeNamespace: config.pinecone.namespace,
          storefrontDomain: config.shopify.storefrontDomain,
        },
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Knowledge retrieval timed out.")), RETRIEVAL_TIMEOUT_MS);
      }),
    ]);
  }

  private setCache(query: string, value: KnowledgeDocument[]): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(query, {
      value,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }
}

export const knowledgeService = new KnowledgeService();
