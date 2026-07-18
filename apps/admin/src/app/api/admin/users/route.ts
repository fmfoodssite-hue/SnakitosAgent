import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";
import { hashPassword } from "@/lib/security";
import {
  loadAdminPermissionsMap,
  loadRolePermissionDefaults,
  replaceAdminPermissions,
} from "@/lib/admin-permissions";
import type { AdminRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin"], async () => {
    try {
      const supabase = assertServiceClient();
      const { data, error } = await supabase
        .from("admins")
        .select("id, email, full_name, is_active, last_login_at, created_at, avatar_url, admin_roles(key, label)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const rolesByAdminId = new Map<string, AdminRole>(
        rows.map((row) => {
          const roleRows = Array.isArray(row.admin_roles) ? row.admin_roles : [row.admin_roles];
          const role = roleRows[0] && typeof roleRows[0] === "object" && "key" in roleRows[0]
            ? String((roleRows[0] as { key?: unknown }).key)
            : "viewer";
          return [String(row.id), role as AdminRole];
        }),
      );
      const permissionsByAdminId = await loadAdminPermissionsMap(
        supabase,
        rows.map((row) => String(row.id)),
        rolesByAdminId,
      );
      return successResponse(rows.map((row) => ({ ...row, permissions: permissionsByAdminId.get(String(row.id)) ?? [] })));
    } catch (error) {
      console.error("Users load failed", error);
      return errorResponse("USERS_LOAD_FAILED", "Unable to load users.", 500);
    }
  }, ["users.manage"]);
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin"], async ({ admin, ipAddress }) => {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        name?: string;
        email?: string;
        password?: string;
        role?: string;
        status?: string;
        permissions?: string[];
      };

      if (!body.name?.trim() || !body.email?.trim() || !body.password || !body.role || !body.status) {
        return errorResponse("VALIDATION_FAILED", "Name, email, password, role, and status are required.", 400);
      }

      if (body.password.length < 8) {
        return errorResponse("VALIDATION_FAILED", "Password must be at least 8 characters.", 400);
      }

      if (!["Active", "Disabled"].includes(body.status)) {
        return errorResponse("VALIDATION_FAILED", "Invalid status.", 400);
      }

      const supabase = assertServiceClient();
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

      if (roleError || !role) {
        throw roleError ?? new Error("Role not found.");
      }

      const roleDefaults = await loadRolePermissionDefaults(supabase);
      const permissions = Array.isArray(body.permissions) ? body.permissions : roleDefaults[roleKey] ?? [];

      const { data, error } = await supabase
        .from("admins")
        .insert({
          email: body.email.toLowerCase().trim(),
          full_name: body.name.trim(),
          password_hash: hashPassword(body.password),
          role_id: role.id,
          is_active: body.status === "Active",
          must_change_password: false,
          password_changed_at: new Date().toISOString(),
        })
        .select("id, email, full_name, is_active")
        .single();

      if (error) {
        throw error;
      }

      const savedPermissions = await replaceAdminPermissions(supabase, data.id, permissions);

      await safeAudit({
        adminId: admin.id,
        action: "user.create",
        entityType: "admin",
        entityId: data.id,
        details: { email: data.email, role: roleKey, status: body.status, permissions: savedPermissions },
        ipAddress,
      });

      return successResponse({ ...data, permissions: savedPermissions }, { status: 201 });
    } catch (error) {
      console.error("User create failed", error);
      return errorResponse("USER_CREATE_FAILED", "Unable to create user.", 500);
    }
  }, ["users.manage"]);
}
