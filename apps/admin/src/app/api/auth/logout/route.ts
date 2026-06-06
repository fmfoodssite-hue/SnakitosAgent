import { NextResponse } from "next/server";
import { clearAdminSession, getAdminSession, getRequestIpAddress } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST() {
  const session = await getAdminSession();
  await clearAdminSession();

  if (session) {
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

