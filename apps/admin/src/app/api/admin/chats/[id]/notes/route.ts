import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin", "support_agent"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      const body = (await request.json().catch(() => ({}))) as { note?: string };
      if (!body.note?.trim()) {
        return errorResponse("VALIDATION_FAILED", "Note is required.", 400);
      }

      const supabase = assertServiceClient();
      const { data: existing, error: fetchError } = await supabase
        .from("chat_messages")
        .select("metadata")
        .eq("id", id)
        .single();
      if (fetchError || !existing) {
        return errorResponse("NOT_FOUND", "Conversation message not found.", 404);
      }

      const metadata = asRecord(existing.metadata);
      const notes = Array.isArray(metadata.notes) ? metadata.notes : [];
      const { data, error } = await supabase
        .from("chat_messages")
        .update({
          metadata: {
            ...metadata,
            notes: [...notes, body.note.trim()],
          },
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "chat.note_add",
        entityType: "chat_message",
        entityId: id,
        ipAddress,
      });
      return successResponse(data);
    } catch (error) {
      console.error("Conversation note failed", error);
      return errorResponse("CHAT_NOTE_FAILED", "Unable to add note.", 500);
    }
  });
}

