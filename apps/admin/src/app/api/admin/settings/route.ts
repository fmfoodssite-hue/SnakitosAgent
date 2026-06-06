import { NextResponse } from "next/server";
import { withAdminAccess, parseJson, safeAudit } from "@/lib/server";
import { settingsSchema } from "@/lib/validations";
import { listSettings, upsertSetting } from "@/lib/services/settings";

export async function GET() {
  return withAdminAccess(["owner", "admin", "content_manager", "viewer"], async () => {
    const settings = await listSettings();
    return NextResponse.json({ settings });
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin"], async ({ admin, ipAddress }) => {
    const parsed = await parseJson(request, settingsSchema);
    if (parsed instanceof NextResponse) {
      return parsed;
    }

    const setting = await upsertSetting({
      ...parsed,
      updated_by: admin.id,
    });

    await safeAudit({
      adminId: admin.id,
      action: "setting.upsert",
      entityType: "setting",
      entityId: String(setting.id),
      details: { key: setting.key },
      ipAddress,
    });

    return NextResponse.json({ setting });
  });
}

