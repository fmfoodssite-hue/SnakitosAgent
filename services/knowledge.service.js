import { config } from "../config";
import { retrieveKnowledge } from "../lib/pinecone";
export class KnowledgeService {
    async retrieve(query) {
        if (!query.trim() ||
            !config.openai.apiKey ||
            !config.pinecone.apiKey ||
            !config.pinecone.indexName) {
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
                    pineconeHost: config.pinecone.host,
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
        }
        catch {
            return [];
        }
    }
}
export const knowledgeService = new KnowledgeService();
