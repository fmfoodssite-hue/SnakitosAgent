import { randomUUID } from "crypto";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";
import { hashPassword } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin"], async () => {
    try {
      const supabase = assertServiceClient();
      const { data, error } = await supabase
        .from("admins")
        .select("id, email, full_name, is_active, last_login_at, created_at, admin_roles(key, label)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return successResponse(data ?? []);
    } catch (error) {
      console.error("Users load failed", error);
      return errorResponse("USERS_LOAD_FAILED", "Unable to load users.", 500);
    }
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin"], async ({ admin, ipAddress }) => {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        name?: string;
        email?: string;
        role?: string;
      };

      if (!body.name || !body.email || !body.role) {
        return errorResponse("VALIDATION_FAILED", "Name, email, and role are required.", 400);
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

      const tempPassword = randomUUID();
      const { data, error } = await supabase
        .from("admins")
        .insert({
          email: body.email.toLowerCase().trim(),
          full_name: body.name.trim(),
          password_hash: hashPassword(tempPassword),
          role_id: role.id,
          is_active: true,
          must_change_password: true,
        })
        .select("id, email, full_name, is_active")
        .single();

      if (error) {
        throw error;
      }

      await safeAudit({
        adminId: admin.id,
        action: "user.invite",
        entityType: "admin",
        entityId: data.id,
        details: { email: data.email, role: roleKey },
        ipAddress,
      });

      return successResponse({ ...data, tempPassword }, { status: 201 });
    } catch (error) {
      console.error("User invite failed", error);
      return errorResponse("USER_INVITE_FAILED", "Unable to invite user.", 500);
    }
  });
}
