import { withAdminAccess } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const { searchParams } = new URL(request.url);
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10));
      const offset = (page - 1) * limit;
      const reviewedStatus = searchParams.get("reviewed_status");
      const hadSource = searchParams.get("had_source");

      const supabase = assertServiceClient();
      let query = supabase
        .from("answer_traces")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (reviewedStatus) query = query.eq("reviewed_status", reviewedStatus);
      if (hadSource !== null) query = query.eq("had_source", hadSource === "true");

      const { data, error, count } = await query;
      if (error) throw error;

      return successResponse({
        traces: data ?? [],
        total: count ?? 0,
        page,
        limit,
      });
    } catch (error) {
      console.error("Answer traces load failed", error);
      return errorResponse("ANSWER_TRACES_FAILED", "Unable to load answer traces.", 500);
    }
  });
}
