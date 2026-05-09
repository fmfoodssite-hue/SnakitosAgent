import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getBrowserSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

function getServiceSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const supabase = getBrowserSupabaseClient();

export async function getRecentInteractions() {
  const serviceClient = getServiceSupabaseClient();
  if (!serviceClient) {
    console.warn("Supabase service role environment variables are missing for the admin app.");
    return [];
  }

  try {
    const { data, error } = await serviceClient
      .from("logs")
      .select("id, metadata, created_at")
      .eq("event", "chat_processed")
      .order("created_at", { ascending: false })
      .limit(5);

    if (!error && data && data.length > 0) {
      return data.map((row) => {
        const metadata =
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};

        return {
          id: String(row.id),
          user_id: String(metadata.userId ?? "unknown-user"),
          query: String(metadata.userMessage ?? metadata.query ?? "Asked a question..."),
          response: String(metadata.response ?? ""),
          created_at: String(row.created_at ?? new Date().toISOString()),
        };
      });
    }

    const { data: fallbackData, error: fallbackError } = await serviceClient
      .from("messages")
      .select("id, chat_id, role, content, created_at, chats!inner(user_id)")
      .order("created_at", { ascending: false })
      .limit(20);

    if (fallbackError || !fallbackData) {
      return [];
    }

    const userMessages = (fallbackData as Array<Record<string, unknown>>).filter(
      (row) => String(row.role ?? "") === "user",
    );

    return userMessages.slice(0, 5).map((row) => {
      const chatInfo =
        row.chats && typeof row.chats === "object" && !Array.isArray(row.chats)
          ? (row.chats as Record<string, unknown>)
          : {};

      return {
        id: String(row.id ?? crypto.randomUUID()),
        user_id: String(chatInfo.user_id ?? "unknown-user"),
        query: String(row.content ?? "Asked a question..."),
        response: "",
        created_at: String(row.created_at ?? new Date().toISOString()),
      };
    });
  } catch (error) {
    console.error("Supabase Error:", error);
    return [];
  }
}
