import { NextResponse } from "next/server";
import { clearAdminSession, getAdminSession, getRequestIpAddress } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { assertServiceClient } from "@/lib/db";

export async function POST() {
  const session = await getAdminSession();
  await clearAdminSession();

  if (session) {
    const supabase = assertServiceClient();
    await supabase
      .from("admins")
      .update({ last_logout_at: new Date().toISOString() })
      .eq("id", session.adminId);

    await writeAuditLog({
      adminId: session.adminId,
      action: "admin.logout",
      entityType: "auth_session",
      entityId: session.adminId,
      ipAddress: await getRequestIpAddress(),
    });
  }

  return NextResponse.json({ success: true });
}
