import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      const body = (await request.json().catch(() => ({}))) as {
        action?: "role" | "disable";
        role?: string;
      };

      const supabase = assertServiceClient();

      if (body.action === "disable") {
        const { data, error } = await supabase
          .from("admins")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("id")
          .single();
        if (error) throw error;

        await supabase
          .from("admin_refresh_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("admin_id", id)
          .is("revoked_at", null);

        await safeAudit({
          adminId: admin.id,
          action: "user.disable",
          entityType: "admin",
          entityId: id,
          ipAddress,
        });
        return successResponse(data);
      }

      if (body.action === "role" && body.role) {
        const roleKeyMap: Record<string, string> = {
          Owner: "owner",
          Admin: "admin",
          "Support Agent": "support_agent",
          "Content Manager": "content_manager",
          Viewer: "viewer",
        };
        const roleKey = roleKeyMap[body.role];
        if (!roleKey) {
          return errorResponse("VALIDATION_FAILED", "Invalid role.", 400);
        }
        const { data: role, error: roleError } = await supabase
          .from("admin_roles")
          .select("id")
          .eq("key", roleKey)
          .single();
        if (roleError || !role) throw roleError ?? new Error("Role not found.");

        const { data, error } = await supabase
          .from("admins")
          .update({ role_id: role.id, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("id")
          .single();
        if (error) throw error;

        await safeAudit({
          adminId: admin.id,
          action: "user.role_change",
          entityType: "admin",
          entityId: id,
          details: { role: roleKey },
          ipAddress,
        });
        return successResponse(data);
      }

      return errorResponse("VALIDATION_FAILED", "Unsupported user action.", 400);
    } catch (error) {
      console.error("User update failed", error);
      return errorResponse("USER_UPDATE_FAILED", "Unable to update user.", 500);
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
      const { error } = await supabase.from("admins").delete().eq("id", id);
      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "user.delete",
        entityType: "admin",
        entityId: id,
        ipAddress,
      });

      return successResponse({ id });
    } catch (error) {
      console.error("User delete failed", error);
      return errorResponse("USER_DELETE_FAILED", "Unable to delete user.", 500);
    }
  });
}
