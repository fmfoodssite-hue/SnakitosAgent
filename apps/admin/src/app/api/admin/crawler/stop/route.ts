import { withAdminAccess, safeAudit } from "@/lib/server";
import { errorResponse, successResponse } from "@/lib/response";
import { stopActiveCrawls } from "@/lib/services/crawler";

export const dynamic = "force-dynamic";

export async function POST() {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const result = await stopActiveCrawls();

      await safeAudit({
        adminId: admin.id,
        action: "crawler.stop",
        entityType: "ingestion_job",
        details: { cancelled: result.cancelled },
        ipAddress,
      });

      return successResponse(result);
    } catch (error) {
      console.error("Crawler stop failed", error);
      return errorResponse("CRAWLER_STOP_FAILED", "Unable to stop crawls.", 500);
    }
  });
}
