import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function POST() {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const supabase = assertServiceClient();
      await supabase.from("settings").upsert({
        key: "crawler_runtime",
        value: { running: false, stoppedAt: new Date().toISOString() },
        description: "Crawler runtime status",
        updated_by: admin.id,
        updated_at: new Date().toISOString(),
      });

      await safeAudit({
        adminId: admin.id,
        action: "crawler.stop",
        entityType: "crawler",
        ipAddress,
      });
      return successResponse({ stopped: true });
    } catch (error) {
      console.error("Crawler stop failed", error);
      return errorResponse("CRAWLER_STOP_FAILED", "Unable to stop crawler.", 500);
    }
  });
}

