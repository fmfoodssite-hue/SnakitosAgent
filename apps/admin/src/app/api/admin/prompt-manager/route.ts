import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

const toneMap: Record<string, string> = {
  Friendly: "friendly",
  Professional: "professional",
  "Sales-focused": "sales_focused",
  "Support-focused": "support_focused",
  "Roman Urdu": "roman_urdu",
};

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        prompt?: string;
        tone?: string;
        languageMode?: string;
      };

      if (!body.prompt || !body.tone || !body.languageMode) {
        return errorResponse("VALIDATION_FAILED", "Prompt, tone, and language mode are required.", 400);
      }

      const supabase = assertServiceClient();
      const { count } = await supabase.from("prompt_versions").select("*", { count: "exact", head: true });
      const versionLabel = `v${(count ?? 0) + 1}`;

      await supabase.from("prompt_versions").update({ is_active: false }).neq("id", "");

      const { data, error } = await supabase
        .from("prompt_versions")
        .insert({
          version_label: versionLabel,
          system_prompt: body.prompt,
          fallback_message: "I don't have confirmed information for that right now.",
          language_rules: body.languageMode,
          escalation_rules: "Escalate to support when information is missing or risky.",
          anti_hallucination_rules: `tone=${toneMap[body.tone] ?? body.tone}`,
          is_active: true,
          created_by: admin.id,
        })
        .select("*")
        .single();

      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "prompt.save",
        entityType: "prompt_version",
        entityId: data.id,
        details: { version: versionLabel },
        ipAddress,
      });
      return successResponse(data, { status: 201 });
    } catch (error) {
      console.error("Prompt save failed", error);
      return errorResponse("PROMPT_SAVE_FAILED", "Unable to save prompt settings.", 500);
    }
  });
}

