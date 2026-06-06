import { NextResponse } from "next/server";
import { withAdminAccess, parseJson, safeAudit } from "@/lib/server";
import { promptSchema } from "@/lib/validations";
import { activatePromptVersion, createPromptVersion, listPromptVersions } from "@/lib/services/prompts";

export async function GET() {
  return withAdminAccess(["owner", "admin", "content_manager", "viewer"], async () => {
    const prompts = await listPromptVersions();
    return NextResponse.json({ prompts });
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    const parsed = await parseJson(request, promptSchema);
    if (parsed instanceof NextResponse) {
      return parsed;
    }

    const prompt = await createPromptVersion({
      ...parsed,
      created_by: admin.id,
    });

    await safeAudit({
      adminId: admin.id,
      action: "prompt.create",
      entityType: "prompt_version",
      entityId: prompt.id,
      details: { version: prompt.version_label, isActive: prompt.is_active },
      ipAddress,
    });

    return NextResponse.json({ prompt }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    const body = (await request.json()) as { id?: string; activate?: boolean };
    if (!body.id || !body.activate) {
      return NextResponse.json({ error: "id and activate=true are required" }, { status: 400 });
    }

    const prompt = await activatePromptVersion(body.id);

    await safeAudit({
      adminId: admin.id,
      action: "prompt.activate",
      entityType: "prompt_version",
      entityId: body.id,
      details: { version: prompt.version_label },
      ipAddress,
    });

    return NextResponse.json({ prompt });
  });
}

