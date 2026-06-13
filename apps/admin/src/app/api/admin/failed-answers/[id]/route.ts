import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      const body = (await request.json().catch(() => ({}))) as { action?: "ignore" | "fix" };
      const supabase = assertServiceClient();

      if (body.action === "ignore" || body.action === "fix") {
        const metadataPatch =
          body.action === "ignore"
            ? { failedAnswerStatus: "ignored" }
            : { failedAnswerStatus: "fixed" };

        const { data, error } = await supabase
          .from("chat_messages")
          .update({
            is_failed_answer: body.action === "fix" ? false : true,
            metadata: metadataPatch,
          })
          .eq("id", id)
          .select("*")
          .single();

        if (error) throw error;

        await safeAudit({
          adminId: admin.id,
          action: `failed_answer.${body.action}`,
          entityType: "chat_message",
          entityId: id,
          ipAddress,
        });

        return successResponse(data);
      }

      return errorResponse("VALIDATION_FAILED", "Unsupported failed answer action.", 400);
    } catch (error) {
      console.error("Failed answer update failed", error);
      return errorResponse("FAILED_ANSWER_UPDATE_FAILED", "Unable to update failed answer.", 500);
    }
  });
}

