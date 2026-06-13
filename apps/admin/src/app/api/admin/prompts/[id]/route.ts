import { withAdminAccess, safeAudit } from "@/lib/server";
import { errorResponse, successResponse } from "@/lib/response";
import {
  approvePromptVersion,
  publishPromptVersion,
  rollbackPromptVersion,
  activatePromptVersion,
} from "@/lib/services/prompts";
import { assertServiceClient } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin", "content_manager", "viewer"], async () => {
    try {
      const { id } = await params;
      const supabase = assertServiceClient();
      const { data, error } = await supabase
        .from("prompt_versions")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return successResponse(data);
    } catch (error) {
      console.error("Prompt load failed", error);
      return errorResponse("PROMPT_NOT_FOUND", "Prompt version not found.", 404);
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

      if (body.action === "approve") {
        const prompt = await approvePromptVersion(id, admin.id);
        await safeAudit({
          adminId: admin.id,
          action: "prompt.approve",
          entityType: "prompt_version",
          entityId: id,
          ipAddress,
        });
        return successResponse(prompt);
      }

      if (body.action === "publish") {
        const prompt = await publishPromptVersion(id, admin.id);
        await safeAudit({
          adminId: admin.id,
          action: "prompt.publish",
          entityType: "prompt_version",
          entityId: id,
          ipAddress,
        });
        return successResponse(prompt);
      }

      if (body.action === "rollback") {
        const prompt = await rollbackPromptVersion(id, admin.id);
        await safeAudit({
          adminId: admin.id,
          action: "prompt.rollback",
          entityType: "prompt_version",
          entityId: id,
          ipAddress,
        });
        return successResponse(prompt);
      }

      if (body.action === "activate") {
        const prompt = await activatePromptVersion(id);
        await safeAudit({
          adminId: admin.id,
          action: "prompt.activate",
          entityType: "prompt_version",
          entityId: id,
          ipAddress,
        });
        return successResponse(prompt);
      }

      return errorResponse("VALIDATION_FAILED", "Valid actions: approve, publish, rollback, activate.", 400);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return errorResponse("PROMPT_ACTION_FAILED", msg, 400);
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

      // Cannot delete active prompt
      const { data: target } = await supabase
        .from("prompt_versions")
        .select("is_active")
        .eq("id", id)
        .maybeSingle();

      if (target?.is_active) {
        return errorResponse("PROMPT_DELETE_BLOCKED", "Cannot delete the active prompt version.", 409);
      }

      // Soft delete — set status to archived
      const { error } = await supabase
        .from("prompt_versions")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "prompt.archive",
        entityType: "prompt_version",
        entityId: id,
        ipAddress,
      });

      return successResponse({ archived: true });
    } catch (error) {
      console.error("Prompt delete failed", error);
      return errorResponse("PROMPT_DELETE_FAILED", "Unable to archive prompt version.", 500);
    }
  });
}
