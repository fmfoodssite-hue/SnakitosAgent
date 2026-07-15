import { z } from "zod";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

const sourceSchema = z.object({
  source_type: z.string().min(2),
  name: z.string().min(2),
  category: z.string().optional().default("General FAQ"),
  url: z.string().url().optional().nullable(),
  language: z.string().optional().default("English"),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  trusted: z.boolean().default(true),
});

export async function GET(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const { searchParams } = new URL(request.url);
      const status = searchParams.get("status");
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10));
      const offset = (page - 1) * limit;

      const supabase = assertServiceClient();
      let query = supabase
        .from("knowledge_sources")
        .select("*", { count: "exact" })
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq("status", status);

      const { data, error, count } = await query;
      if (error) throw error;

      return successResponse({ sources: data ?? [], total: count ?? 0, page, limit });
    } catch (error) {
      console.error("Sources load failed", error);
      return errorResponse("SOURCES_LOAD_FAILED", "Unable to load knowledge sources.", 500);
    }
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const body = await request.json().catch(() => null);
      const parsed = sourceSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse("VALIDATION_FAILED", "Invalid source payload.", 400, parsed.error.flatten());
      }

      const supabase = assertServiceClient();
      const { data, error } = await supabase
        .from("knowledge_sources")
        .insert({
          ...parsed.data,
          title: parsed.data.name,
          source_url: parsed.data.url ?? null,
          status: "waiting",
          created_by: admin.id,
        })
        .select("*")
        .single();

      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "source.create",
        entityType: "knowledge_source",
        entityId: data.id,
        details: { name: parsed.data.name, type: parsed.data.source_type },
        ipAddress,
      });

      return successResponse(data, { status: 201 });
    } catch (error) {
      console.error("Source create failed", error);
      return errorResponse("SOURCE_CREATE_FAILED", "Unable to create knowledge source.", 500);
    }
  });
}
