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
        .from("ingestion_jobs")
        .select("*, knowledge_documents(title), knowledge_sources(name)")
        .eq("id", id)
        .single();

      if (error) throw error;
      return successResponse(data);
    } catch (error) {
      console.error("Ingestion job load failed", error);
      return errorResponse("INGESTION_JOB_NOT_FOUND", "Ingestion job not found.", 404);
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
      const body = (await request.json().catch(() => ({}))) as { action?: string };

      if (!body.action || !["cancel", "retry"].includes(body.action)) {
        return errorResponse("VALIDATION_FAILED", "Action must be cancel or retry.", 400);
      }

      const supabase = assertServiceClient();
      const newStatus = body.action === "cancel" ? "cancelled" : "queued";
      const { data, error } = await supabase
        .from("ingestion_jobs")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
          ...(body.action === "retry" ? { retry_count: 0, error_message: null, failed_at: null } : {}),
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: `ingestion_job.${body.action}`,
        entityType: "ingestion_job",
        entityId: id,
        ipAddress,
      });

      return successResponse(data);
    } catch (error) {
      console.error("Ingestion job update failed", error);
      return errorResponse("INGESTION_JOB_UPDATE_FAILED", "Unable to update ingestion job.", 500);
    }
  });
}
