import { withAdminAccess } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const { searchParams } = new URL(request.url);
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10));
      const offset = (page - 1) * limit;
      const status = searchParams.get("status");

      const supabase = assertServiceClient();

      // Try production failed_answers table first
      let query = supabase
        .from("failed_answers")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq("status", status);

      const { data: faData, error: faError, count: faCount } = await query;

      if (!faError && (faData ?? []).length > 0) {
        return successResponse({
          failed_answers: faData ?? [],
          total: faCount ?? 0,
          page,
          limit,
          source: "failed_answers",
        });
      }

      // Fallback to legacy chat_messages with is_failed_answer=true
      const { data: legacyData, error: legacyError, count: legacyCount } = await supabase
        .from("chat_messages")
        .select("id, session_id, user_message, ai_response, detected_intent, metadata, created_at", { count: "exact" })
        .eq("is_failed_answer", true)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (legacyError) throw legacyError;

      return successResponse({
        failed_answers: (legacyData ?? []).map((row) => ({
          id: row.id,
          conversation_id: row.session_id,
          user_question: row.user_message ?? "",
          bot_answer: row.ai_response ?? "",
          root_cause: "missing_source",
          severity: "medium",
          status: "open",
          created_at: row.created_at,
        })),
        total: legacyCount ?? 0,
        page,
        limit,
        source: "chat_messages_compat",
      });
    } catch (error) {
      console.error("Failed answers load failed", error);
      return errorResponse("FAILED_ANSWERS_LOAD_FAILED", "Unable to load failed answers.", 500);
    }
  });
}
