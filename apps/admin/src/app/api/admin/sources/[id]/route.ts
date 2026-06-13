import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const { id } = await params;
      const supabase = assertServiceClient();
      const { data, error } = await supabase
        .from("knowledge_sources")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return successResponse(data);
    } catch (error) {
      console.error("Source load failed", error);
      return errorResponse("SOURCE_NOT_FOUND", "Knowledge source not found.", 404);
    }
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const { action, ...fields } = body as { action?: string; [key: string]: unknown };

      const supabase = assertServiceClient();

      if (action === "reingest") {
        // Create a new ingestion job for this source
        await supabase.from("ingestion_jobs").insert({
          source_id: id,
          job_type: "re_ingest",
          status: "queued",
          created_by: admin.id,
        });

        await safeAudit({
          adminId: admin.id,
          action: "source.reingest",
          entityType: "knowledge_source",
          entityId: id,
          ipAddress,
        });

        return successResponse({ message: "Re-ingestion job queued." });
      }

      const allowedFields = ["name", "category", "priority", "trusted", "language", "status"];
      const safeFields: Record<string, unknown> = {};
      for (const key of allowedFields) {
        if (key in fields) safeFields[key] = fields[key];
      }

      const { data, error } = await supabase
        .from("knowledge_sources")
        .update({ ...safeFields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "source.update",
        entityType: "knowledge_source",
        entityId: id,
        details: safeFields,
        ipAddress,
      });

      return successResponse(data);
    } catch (error) {
      console.error("Source update failed", error);
      return errorResponse("SOURCE_UPDATE_FAILED", "Unable to update knowledge source.", 500);
    }
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      const supabase = assertServiceClient();

      // Cascade delete chunks first
      await supabase.from("rag_chunks").delete().eq("source_id", id);

      const { error } = await supabase.from("knowledge_sources").delete().eq("id", id);
      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "source.delete",
        entityType: "knowledge_source",
        entityId: id,
        ipAddress,
      });

      return successResponse({ deleted: true });
    } catch (error) {
      console.error("Source delete failed", error);
      return errorResponse("SOURCE_DELETE_FAILED", "Unable to delete knowledge source.", 500);
    }
  });
}
