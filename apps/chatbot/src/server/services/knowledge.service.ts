import { Pinecone } from "@pinecone-database/pinecone";
import { randomUUID } from "crypto";
import { config } from "../config";
import { KnowledgeDocument } from "../types/chat.types";
import { supabaseService } from "./supabase.service";

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 5);
}

export class KnowledgeService {
  private pinecone: Pinecone | null;

  constructor() {
    this.pinecone = config.pinecone.apiKey ? new Pinecone({ apiKey: config.pinecone.apiKey }) : null;
  }

  async retrieve(query: string): Promise<KnowledgeDocument[]> {
    const [supabaseMatches, pineconeMatches] = await Promise.all([
      this.searchSupabase(query),
      this.searchPinecone(query),
    ]);

    const merged = [...supabaseMatches];
    for (const match of pineconeMatches) {
      if (!merged.find((item) => item.content === match.content)) {
        merged.push(match);
      }
    }

    return merged.slice(0, 5);
  }

  private async searchSupabase(query: string): Promise<KnowledgeDocument[]> {
    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) {
      return [];
    }

    const filters = tokens
      .map((token) => `title.ilike.%${token}%,content.ilike.%${token}%`)
      .join(",");

    try {
      const { data, error } = await supabaseService.client
        .from("knowledge_documents")
        .select("id,title,content,source")
        .or(filters)
        .limit(5);

      if (error || !data) {
        return [];
      }

      return data.map((item) => ({
        id: item.id,
        title: item.title ?? "Knowledge",
        content: item.content ?? "",
        source: item.source ?? "supabase",
      }));
    } catch {
      return [];
    }
  }

  private async searchPinecone(query: string): Promise<KnowledgeDocument[]> {
    if (!this.pinecone || !config.pinecone.indexName || !query.trim()) {
      return [];
    }

    try {
      const index = this.pinecone.index(config.pinecone.indexName);
      const searchRecords = (index as unknown as {
        searchRecords?: (input: {
          query: { inputs: { text: string }, topK: number };
          namespace?: string;
          fields?: string[];
        }) => Promise<{
          result?: {
            hits?: Array<{
              _id?: string;
              fields?: Record<string, unknown>;
            }>;
          };
        }>;
      }).searchRecords;

      if (!searchRecords) {
        return [];
      }

      const response = await searchRecords.call(index, {
        query: {
          inputs: {
            text: query,
          },
          topK: 5,
        },
        namespace: config.pinecone.namespace || undefined,
        fields: ["title", "content", "source"],
      });

      return (
        response.result?.hits?.map((hit) => ({
          id: hit._id ?? randomUUID(),
          title: String(hit.fields?.title ?? "Knowledge"),
          content: String(hit.fields?.content ?? ""),
          source: String(hit.fields?.source ?? "pinecone"),
        })) ?? []
      );
    } catch {
      return [];
    }
  }
}

export const knowledgeService = new KnowledgeService();
