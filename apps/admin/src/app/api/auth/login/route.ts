import { NextResponse } from "next/server";
import { authenticateAdmin, createAdminSession, getRequestIpAddress } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { loginSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const payload = loginSchema.parse(await request.json());
    const admin = await authenticateAdmin(payload.email, payload.password);

    if (!admin) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    await createAdminSession(admin);
    await writeAuditLog({
      adminId: admin.id,
      action: "admin.login",
      entityType: "auth_session",
      entityId: admin.id,
      details: { role: admin.role, email: admin.email },
      ipAddress: await getRequestIpAddress(),
    });

    return NextResponse.json({ success: true, admin });
  } catch (error) {
    console.error("Admin login failed", error);
    return NextResponse.json({ error: "Unable to login" }, { status: 400 });
  }
}

