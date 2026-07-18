import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";
import { loadRolePermissionDefaults, replaceAdminPermissions } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      const body = (await request.json().catch(() => ({}))) as {
        action?: "role" | "disable" | "update";
        name?: string;
        email?: string;
        role?: string;
        status?: string;
        permissions?: string[];
      };

      const supabase = assertServiceClient();

      if (body.action === "disable") {
        if (id === admin.id) {
          return errorResponse("VALIDATION_FAILED", "You cannot disable your own account.", 400);
        }

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

      const roleKeyMap: Record<string, string> = {
        Owner: "owner",
        Admin: "admin",
        "Support Agent": "support_agent",
        "Content Manager": "content_manager",
        Viewer: "viewer",
      };

      if (body.action === "role" && body.role) {
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

        const roleDefaults = await loadRolePermissionDefaults(supabase);
        const savedPermissions = await replaceAdminPermissions(supabase, id, roleDefaults[roleKey] ?? []);

        await supabase
          .from("admin_refresh_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("admin_id", id)
          .is("revoked_at", null);

        await safeAudit({
          adminId: admin.id,
          action: "user.role_change",
          entityType: "admin",
          entityId: id,
          details: { role: roleKey, permissions: savedPermissions },
          ipAddress,
        });
        return successResponse({ ...data, permissions: savedPermissions });
      }

      if (body.action === "update") {
        if (!body.name?.trim() || !body.email?.trim() || !body.role || !body.status) {
          return errorResponse("VALIDATION_FAILED", "Name, email, role, and status are required.", 400);
        }

        if (!["Active", "Disabled"].includes(body.status)) {
          return errorResponse("VALIDATION_FAILED", "Invalid status.", 400);
        }

        if (id === admin.id && body.status === "Disabled") {
          return errorResponse("VALIDATION_FAILED", "You cannot disable your own account.", 400);
        }

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
          .update({
            email: body.email.toLowerCase().trim(),
            full_name: body.name.trim(),
            role_id: role.id,
            is_active: body.status === "Active",
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select("id")
          .single();
        if (error) throw error;

        const roleDefaults = await loadRolePermissionDefaults(supabase);
        const savedPermissions = await replaceAdminPermissions(
          supabase,
          id,
          Array.isArray(body.permissions) ? body.permissions : roleDefaults[roleKey] ?? [],
        );

        if (body.status === "Disabled") {
          await supabase
            .from("admin_refresh_tokens")
            .update({ revoked_at: new Date().toISOString() })
            .eq("admin_id", id)
            .is("revoked_at", null);
        }

        await supabase
          .from("admin_refresh_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("admin_id", id)
          .is("revoked_at", null);

        await safeAudit({
          adminId: admin.id,
          action: "user.update",
          entityType: "admin",
          entityId: id,
          details: { email: body.email.toLowerCase().trim(), role: roleKey, status: body.status, permissions: savedPermissions },
          ipAddress,
        });
        return successResponse({ ...data, permissions: savedPermissions });
      }

      return errorResponse("VALIDATION_FAILED", "Unsupported user action.", 400);
    } catch (error) {
      console.error("User update failed", error);
      return errorResponse("USER_UPDATE_FAILED", "Unable to update user.", 500);
    }
  }, ["users.manage"]);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      if (id === admin.id) {
        return errorResponse("VALIDATION_FAILED", "You cannot delete your own account.", 400);
      }

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
  }, ["users.manage"]);
}
