import { retrieveKnowledge } from "@lib/pinecone";
import { config } from "../config";
import capabilityKnowledgeData from "../data/capability-knowledge.json";
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
    if (!normalizedQuery) {
      return [];
    }

    const cached = this.cache.get(normalizedQuery);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const localResults = this.retrieveCapabilityKnowledge(normalizedQuery);

    if (!config.openai.apiKey || !config.pinecone.apiKey || !config.pinecone.indexName) {
      this.setCache(normalizedQuery, localResults);
      return localResults;
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

      const merged = this.mergeKnowledge(localResults, mapped);
      this.setCache(normalizedQuery, merged);
      return merged;
    } catch {
      this.setCache(normalizedQuery, localResults);
      return localResults;
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

  private retrieveCapabilityKnowledge(query: string): KnowledgeDocument[] {
    const tokens = query.split(/[^a-z0-9]+/).filter((token) => token.length >= 2);

    return capabilityKnowledgeData
      .map((item) => {
        const keywordMatches = item.keywords.filter((keyword) => query.includes(keyword.toLowerCase()))
          .length;
        const tokenMatches = tokens.filter(
          (token) =>
            item.description.toLowerCase().includes(token) ||
            item.name.toLowerCase().includes(token) ||
            item.keywords.some((keyword) => keyword.toLowerCase().includes(token)),
        ).length;
        const score = keywordMatches * 5 + tokenMatches;

        return {
          score,
          document: {
            id: item.id,
            name: item.name,
            text: item.description,
            link: item.link,
            type: item.type,
            category: item.category,
            source: "capability_doc",
          } satisfies KnowledgeDocument,
        };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
      .map((item) => item.document);
  }

  private mergeKnowledge(
    localResults: KnowledgeDocument[],
    pineconeResults: KnowledgeDocument[],
  ): KnowledgeDocument[] {
    const seen = new Set<string>();
    const merged = [...localResults, ...pineconeResults].filter((item) => {
      const key = `${item.source}:${item.id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return merged.slice(0, 6);
  }
}

export const knowledgeService = new KnowledgeService();
