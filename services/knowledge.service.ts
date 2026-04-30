import { config } from "../config";
import { retrieveKnowledge } from "../lib/pinecone";
import { KnowledgeDocument } from "../types/chat.types";

export class KnowledgeService {
  async retrieve(query: string): Promise<KnowledgeDocument[]> {
    if (
      !query.trim() ||
      !config.openai.apiKey ||
      !config.pinecone.apiKey ||
      !config.pinecone.indexName
    ) {
      return [];
    }

    try {
      const results = await retrieveKnowledge({
        query,
        topK: 5,
        runtimeConfig: {
          openAiApiKey: config.openai.apiKey,
          pineconeApiKey: config.pinecone.apiKey,
          pineconeIndexName: config.pinecone.indexName,
          pineconeNamespace: config.pinecone.namespace,
          storefrontDomain: config.shopify.storefrontDomain,
        },
      });

      return results.map((item) => ({
        id: item.id,
        name: item.name,
        text: item.text,
        link: item.link,
        type: item.type,
        category: item.category,
        source: "pinecone",
      }));
    } catch {
      return [];
    }
  }
}

export const knowledgeService = new KnowledgeService();
