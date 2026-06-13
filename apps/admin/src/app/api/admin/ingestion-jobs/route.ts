import { withAdminAccess } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

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
        .from("ingestion_jobs")
        .select("*, knowledge_documents(title), knowledge_sources(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return successResponse({
        jobs: data ?? [],
        total: count ?? 0,
        page,
        limit,
      });
    } catch (error) {
      console.error("Ingestion jobs load failed", error);
      return errorResponse("INGESTION_JOBS_LOAD_FAILED", "Unable to load ingestion jobs.", 500);
    }
  });
}
