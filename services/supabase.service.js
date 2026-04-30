import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { config } from "../config";
export const supabaseClient = createClient(config.supabase.url || "https://invalid.local", config.supabase.serviceRoleKey || "missing-service-role-key", {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
export class SupabaseService {
    client = supabaseClient;
    async upsertUser(input) {
        const id = input.id || randomUUID();
        await this.client.from("users").upsert({
            id,
            email: input.email ?? null,
            phone: input.phone ?? null,
        }, {
            onConflict: "id",
        });
        return id;
    }
    async getOrCreateChat(userId, chatId) {
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
    async addMessage(chatId, role, content) {
        await this.client.from("messages").insert({
            id: randomUUID(),
            chat_id: chatId,
            role,
            content,
        });
    }
    async getRecentMessages(chatId, limit = 6) {
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
            .map((item) => ({ role: item.role, content: item.content }));
    }
    async logEvent(event, metadata) {
        await this.client.from("logs").insert({
            id: randomUUID(),
            event,
            metadata,
        });
    }
    async getRecentLogs(limit = 50) {
        const { data } = await this.client
            .from("logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit);
        return (data ?? []);
    }
}
export const supabaseService = new SupabaseService();
