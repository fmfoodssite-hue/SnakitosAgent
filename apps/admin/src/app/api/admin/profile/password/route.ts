import { getAdminSession } from "@/lib/auth";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";
import { hashPassword, verifyPassword } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async ({ admin, ipAddress }) => {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        currentPassword?: string;
        newPassword?: string;
      };

      if (!body.currentPassword || !body.newPassword) {
        return errorResponse("VALIDATION_FAILED", "Current password and new password are required.", 400);
      }

      if (body.newPassword.length < 8) {
        return errorResponse("VALIDATION_FAILED", "New password must be at least 8 characters.", 400);
      }

      if (body.currentPassword === body.newPassword) {
        return errorResponse("VALIDATION_FAILED", "New password must be different from the current password.", 400);
      }

      const supabase = assertServiceClient();
      const { data: record, error: loadError } = await supabase
        .from("admins")
        .select("id, password_hash")
        .eq("id", admin.id)
        .single();

      if (loadError || !record) {
        return errorResponse("PROFILE_NOT_FOUND", "Unable to load current user.", 404);
      }

      if (!verifyPassword(body.currentPassword, record.password_hash)) {
        return errorResponse("INVALID_PASSWORD", "Current password is incorrect.", 400);
      }

      const { error: updateError } = await supabase
        .from("admins")
        .update({
          password_hash: hashPassword(body.newPassword),
          password_changed_at: new Date().toISOString(),
          must_change_password: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", admin.id);

      if (updateError) {
        throw updateError;
      }

      const session = await getAdminSession();
      if (session) {
        await supabase
          .from("admin_refresh_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("admin_id", admin.id)
          .neq("session_id", session.sessionId)
          .is("revoked_at", null);
      }

      await safeAudit({
        adminId: admin.id,
        action: "profile.password_change",
        entityType: "admin",
        entityId: admin.id,
        ipAddress,
      });

      return successResponse({ changed: true });
    } catch (error) {
      console.error("Password change failed", error);
      return errorResponse("PASSWORD_CHANGE_FAILED", "Unable to change password.", 500);
    }
  });
}
