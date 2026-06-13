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
      const body = (await request.json().catch(() => ({}))) as { action?: string };
      const supabase = assertServiceClient();

      if (body.action !== "toggle") {
        return errorResponse("VALIDATION_FAILED", "Unsupported FAQ action.", 400);
      }

      const { data: existing, error: fetchError } = await supabase
        .from("knowledge_documents")
        .select("id, status")
        .eq("id", id)
        .eq("source_type", "faq")
        .single();

      if (fetchError || !existing) {
        return errorResponse("NOT_FOUND", "FAQ not found.", 404);
      }

      const nextStatus = existing.status === "active" ? "draft" : "active";
      const { data, error } = await supabase
        .from("knowledge_documents")
        .update({ status: nextStatus, updated_by: admin.id, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      await safeAudit({
        adminId: admin.id,
        action: "faq.toggle",
        entityType: "knowledge_document",
        entityId: id,
        details: { status: nextStatus },
        ipAddress,
      });

      return successResponse(data);
    } catch (error) {
      console.error("FAQ toggle failed", error);
      return errorResponse("FAQ_TOGGLE_FAILED", "Unable to update FAQ status.", 500);
    }
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      const supabase = assertServiceClient();
      const { error } = await supabase
        .from("knowledge_documents")
        .delete()
        .eq("id", id)
        .eq("source_type", "faq");

      if (error) {
        throw error;
      }

      await safeAudit({
        adminId: admin.id,
        action: "faq.delete",
        entityType: "knowledge_document",
        entityId: id,
        ipAddress,
      });

      return successResponse({ id });
    } catch (error) {
      console.error("FAQ delete failed", error);
      return errorResponse("FAQ_DELETE_FAILED", "Unable to delete FAQ.", 500);
    }
  });
}

