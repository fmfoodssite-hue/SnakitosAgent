import { withAdminAccess } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const supabase = assertServiceClient();
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return successResponse(data ?? []);
    } catch (error) {
      console.error("Latest alerts failed", error);
      return errorResponse("ALERTS_LATEST_FAILED", "Unable to load latest alerts.", 500);
    }
  });
}
