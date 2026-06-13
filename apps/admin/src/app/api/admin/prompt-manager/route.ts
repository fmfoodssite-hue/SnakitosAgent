import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin", "content_manager", "viewer"], async () => {
    try {
      const supabase = assertServiceClient();
      const { data } = await supabase
        .from("prompt_versions")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return successResponse(data ?? null);
    } catch (error) {
      console.error("Prompt manager load failed", error);
      return errorResponse("PROMPT_MANAGER_FAILED", "Unable to load active prompt.", 500);
    }
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        system_prompt?: string;
        fallback_message?: string;
        language_rules?: string;
        escalation_rules?: string;
        anti_hallucination_rules?: string;
        version_label?: string;
      };

      if (!body.system_prompt || !body.version_label) {
        return errorResponse("VALIDATION_FAILED", "system_prompt and version_label are required.", 400);
      }

      const supabase = assertServiceClient();

      // Deactivate all current prompts
      await supabase.from("prompt_versions").update({ is_active: false }).neq("id", "00000000-0000-0000-0000-000000000000");

      const { data, error } = await supabase
        .from("prompt_versions")
        .insert({
          version_label: body.version_label,
          system_prompt: body.system_prompt,
          fallback_message: body.fallback_message ?? "",
          language_rules: body.language_rules ?? "",
          escalation_rules: body.escalation_rules ?? "",
          anti_hallucination_rules: body.anti_hallucination_rules ?? "",
          is_active: true,
          status: "published",
          created_by: admin.id,
        })
        .select("*")
        .single();

      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "prompt.publish",
        entityType: "prompt_version",
        entityId: data.id,
        details: { version_label: body.version_label },
        ipAddress,
      });

      return successResponse(data, { status: 201 });
    } catch (error) {
      console.error("Prompt manager save failed", error);
      return errorResponse("PROMPT_MANAGER_SAVE_FAILED", "Unable to save prompt.", 500);
    }
  });
}
