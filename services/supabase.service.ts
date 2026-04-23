import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { config } from "../config";
import { MessageRole } from "../types/chat.types";

export const supabaseClient: SupabaseClient = createClient(
  config.supabase.url || "https://invalid.local",
  config.supabase.serviceRoleKey || "missing-service-role-key",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

export class SupabaseService {
  public readonly client = supabaseClient;

  async upsertUser(input: {
    id?: string;
    email?: string;
    phone?: string;
  }): Promise<string> {
    const id = input.id || randomUUID();

    await this.client.from("users").upsert(
      {
        id,
        email: input.email ?? null,
        phone: input.phone ?? null,
      },
      {
        onConflict: "id",
      },
    );

    return id;
  }

  async getOrCreateChat(userId: string, chatId?: string): Promise<string> {
    if (chatId) {
      return chatId;
    }

    const { data } = await this.client
      .from("chats")
      .select("id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.id && data.created_at) {
      const ageMs = Date.now() - new Date(data.created_at).getTime();
      if (ageMs < 24 * 60 * 60 * 1000) {
        return data.id;
      }
    }

    const newChatId = randomUUID();
    await this.client.from("chats").insert({
      id: newChatId,
      user_id: userId,
    });
    return newChatId;
  }

  async addMessage(chatId: string, role: MessageRole, content: string): Promise<void> {
    await this.client.from("messages").insert({
      id: randomUUID(),
      chat_id: chatId,
      role,
      content,
    });
  }

  async getRecentMessages(
    chatId: string,
    limit = 6,
  ): Promise<Array<{ role: MessageRole; content: string }>> {
    const { data, error } = await this.client
      .from("messages")
      .select("role, content, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) {
      return [];
    }

    return data
      .reverse()
      .map((item) => ({ role: item.role as MessageRole, content: item.content as string }));
  }

  async logEvent(event: string, metadata: Record<string, unknown>): Promise<void> {
    await this.client.from("logs").insert({
      id: randomUUID(),
      event,
      metadata,
    });
  }

  async getRecentLogs(limit = 50): Promise<Array<Record<string, unknown>>> {
    const { data } = await this.client
      .from("logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    return (data ?? []) as Array<Record<string, unknown>>;
  }
}

export const supabaseService = new SupabaseService();
