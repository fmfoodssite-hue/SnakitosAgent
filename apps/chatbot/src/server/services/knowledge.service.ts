import { retrieveKnowledge } from "@lib/pinecone";
import { config } from "../config";
import capabilityKnowledgeData from "../data/capability-knowledge.json";
import generalQueryRagData from "../data/general-query-rag.json";
import { KnowledgeDocument } from "../types/chat.types";

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 100;
const RETRIEVAL_TIMEOUT_MS = 1_800;

type LocalGeneralKnowledgeItem = {
  id: string;
  name: string;
  text: string;
  link: string;
  type: string;
  category: string;
  source: string;
  hints?: string[];
};

export class KnowledgeService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: KnowledgeDocument[] }
  >();

  async retrieve(query: string): Promise<KnowledgeDocument[]> {
    const normalizedQuery = this.normalizeQueryForRetrieval(query);
    if (!normalizedQuery) {
      return [];
    }

    const cached = this.cache.get(normalizedQuery);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const localResults = this.retrieveLocalKnowledge(normalizedQuery);

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

  private normalizeQueryForRetrieval(query: string): string {
    const normalized = query.trim().toLowerCase();
    const expansions: string[] = [];

    const synonymMap: Array<[RegExp, string[]]> = [
      [/\b(wazan|kitna gram|kitne gram)\b/i, ["weight", "size", "grams"]],
      [/\b(halaal|halal hain|halal hai)\b/i, ["halal", "certificate"]],
      [/\b(expiry kitni hai|kitni expiry)\b/i, ["expiry", "shelf life"]],
      [/\b(ingredients kya hain)\b/i, ["ingredients"]],
      [/\b(teekha|spicy chahiye)\b/i, ["spicy"]],
      [/\b(meetha|sweet chahiye)\b/i, ["sweet"]],
      [/\b(namkeen)\b/i, ["salty"]],
      [/\b(same day|advance pe|advance payment)\b/i, ["same day delivery", "advance payment"]],
      [/\b(pakistan mein delivery|pakistan me delivery|poore pakistan|saray pakistan)\b/i, ["delivery all over pakistan"]],
      [/\b(contact number|support number|whatsapp number)\b/i, ["contact support", "whatsapp"]],
      [/\b(refund|return|exchange)\b/i, ["refund", "return", "exchange"]],
    ];

    for (const [pattern, values] of synonymMap) {
      if (pattern.test(normalized)) {
        expansions.push(...values);
      }
    }

    return [normalized, ...expansions].join(" ").trim();
  }

  private retrieveLocalKnowledge(query: string): KnowledgeDocument[] {
    const capabilityResults = this.retrieveCapabilityKnowledge(query);
    const generalResults = this.retrieveGeneralKnowledge(query);
    return this.mergeKnowledge(capabilityResults, generalResults);
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

  private retrieveGeneralKnowledge(query: string): KnowledgeDocument[] {
    const tokens = query.split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
    const docs = generalQueryRagData as LocalGeneralKnowledgeItem[];

    return docs
      .map((item) => {
        const loweredText = item.text.toLowerCase();
        const loweredName = item.name.toLowerCase();
        const loweredCategory = item.category.toLowerCase();
        const loweredHints = (item.hints ?? []).map((hint) => hint.toLowerCase());

        const keywordMatches = loweredHints.filter((hint) => query.includes(hint)).length;
        const tokenMatches = tokens.filter(
          (token) =>
            loweredText.includes(token) ||
            loweredName.includes(token) ||
            loweredCategory.includes(token) ||
            loweredHints.some((hint) => hint.includes(token)),
        ).length;

        const phraseBoost =
          (/\b(brand|about|store|trust)\b/.test(query) && /brand_about/.test(loweredText) ? 8 : 0) +
          (/\b(delivery|shipping|courier|track)\b/.test(query) && /shipping|delivery/.test(loweredText) ? 8 : 0) +
          (/\b(refund|return|exchange)\b/.test(query) && /refund|return|exchange/.test(loweredText) ? 8 : 0) +
          (/\b(payment|cod|cash on delivery)\b/.test(query) && /payment|cash on delivery/.test(loweredText) ? 8 : 0) +
          (/\b(contact|support|whatsapp)\b/.test(query) && /support|contact/.test(loweredText) ? 8 : 0);

        const score = keywordMatches * 6 + tokenMatches + phraseBoost;

        return {
          score,
          document: {
            id: item.id,
            name: item.name,
            text: item.text,
            link: item.link,
            type: item.type,
            category: item.category,
            source: item.source,
          } satisfies KnowledgeDocument,
        };
      })
      .filter((item) => item.score > 1)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6)
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
