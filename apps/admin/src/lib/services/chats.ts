import { assertServiceClient } from "@/lib/db";

export async function listChatSessions() {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, session_id, user_identifier, page_url, language, handoff_status, created_at, updated_at, chat_messages(*)")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function markMessageForReview(messageId: string, assignedAdminId?: string) {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .update({ marked_for_review: true, assigned_admin_id: assignedAdminId ?? null })
    .eq("id", messageId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

