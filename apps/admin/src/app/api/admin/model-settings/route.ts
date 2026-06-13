import { z } from "zod";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

const modelSettingsSchema = z.object({
  model: z.string().min(2).default("gpt-4.1-mini"),
  temperature: z.number().min(0).max(2).default(0.2),
  max_tokens: z.number().min(50).max(32000).default(1000),
  embedding_model: z.string().min(2).default("text-embedding-3-small"),
  rag_top_k: z.number().min(1).max(20).default(6),
  confidence_threshold: z.number().min(0).max(1).default(0.45),
  monthly_budget_usd: z.number().min(0).default(50),
  alert_threshold_pct: z.number().min(0).max(100).default(80),
});

export async function GET() {
  return withAdminAccess(["owner", "admin", "content_manager", "viewer"], async () => {
    try {
      const supabase = assertServiceClient();
      const { data } = await supabase
        .from("settings")
        .select("value_json")
        .eq("key", "model_settings")
        .maybeSingle();

      const defaults = modelSettingsSchema.parse({});
      const settings = data?.value_json ? { ...defaults, ...(data.value_json as object) } : defaults;

      return successResponse(settings);
    } catch (error) {
      console.error("Model settings load failed", error);
      return errorResponse("MODEL_SETTINGS_FAILED", "Unable to load model settings.", 500);
    }
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin"], async ({ admin, ipAddress }) => {
    try {
      const body = await request.json().catch(() => null);
      const parsed = modelSettingsSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse("VALIDATION_FAILED", "Invalid model settings.", 400, parsed.error.flatten());
      }

      const supabase = assertServiceClient();
      const { data, error } = await supabase
        .from("settings")
        .upsert(
          {
            key: "model_settings",
            value_json: parsed.data,
            description: "Model and RAG configuration",
            created_by: admin.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        )
        .select("*")
        .single();

      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "model_settings.update",
        entityType: "settings",
        entityId: "model_settings",
        details: parsed.data,
        ipAddress,
      });

      return successResponse(data);
    } catch (error) {
      console.error("Model settings save failed", error);
      return errorResponse("MODEL_SETTINGS_SAVE_FAILED", "Unable to save model settings.", 500);
    }
  });
}
