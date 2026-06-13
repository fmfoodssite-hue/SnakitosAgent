import { z } from "zod";
import { withAdminAccess } from "@/lib/server";
import { runPlaygroundQuery } from "@/lib/playground";
import { errorResponse, successResponse } from "@/lib/response";

const playgroundSchema = z.object({
  query: z.string().min(2),
  model: z.string().min(2).optional(),
  prompt_version_id: z.string().uuid().optional().nullable(),
  source_scope: z.unknown().optional(),
  language: z.string().optional().nullable(),
  save_trace: z.boolean().optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager"], async () => {
    try {
      const body = await request.json().catch(() => null);
      const parsed = playgroundSchema.safeParse(body);

      if (!parsed.success) {
        return errorResponse("VALIDATION_FAILED", "Invalid playground payload.", 400, parsed.error.flatten());
      }

      const result = await runPlaygroundQuery({
        query: parsed.data.query,
        model: parsed.data.model,
        promptVersionId: parsed.data.prompt_version_id,
        language: parsed.data.language,
        saveTrace: parsed.data.save_trace,
      });

      if (result.status === "not_configured") {
        return errorResponse(
          "NOT_CONFIGURED",
          "OpenAI is not configured for playground testing.",
          503,
        );
      }

      return successResponse(result);
    } catch (error) {
      console.error("Playground test failed", error);
      return errorResponse("PLAYGROUND_TEST_FAILED", "Unable to run playground test.", 500);
    }
  });
}
