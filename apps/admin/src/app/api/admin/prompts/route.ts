import { NextResponse } from "next/server";
import { withAdminAccess, parseJson, safeAudit } from "@/lib/server";
import { promptSchema } from "@/lib/validations";
import { listPromptVersions, createPromptVersion } from "@/lib/services/prompts";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin", "content_manager", "viewer"], async () => {
    const prompts = await listPromptVersions();
    return NextResponse.json({ prompts });
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    const parsed = await parseJson(request, promptSchema);
    if (parsed instanceof NextResponse) return parsed;

    const prompt = await createPromptVersion({
      ...parsed,
      created_by: admin.id,
    });

    await safeAudit({
      adminId: admin.id,
      action: "prompt.create",
      entityType: "prompt_version",
      entityId: prompt.id,
      details: { version_label: prompt.version_label },
      ipAddress,
    });

    return NextResponse.json({ prompt }, { status: 201 });
  });
}
