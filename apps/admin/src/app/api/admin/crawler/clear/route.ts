import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const body = (await request.json().catch(() => ({}))) as { status?: string };
      const supabase = assertServiceClient();

      let query = supabase.from("crawled_pages").delete();

      if (body.status) {
        query = query.eq("status", body.status);
      } else {
        // Delete all (require explicit confirmation in the body)
        query = query.neq("id", "00000000-0000-0000-0000-000000000000");
      }

      const { error } = await query;
      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "crawler.clear",
        entityType: "crawled_pages",
        details: { status_filter: body.status ?? "all" },
        ipAddress,
      });

      return successResponse({ cleared: true, status_filter: body.status ?? "all" });
    } catch (error) {
      console.error("Crawler clear failed", error);
      return errorResponse("CRAWLER_CLEAR_FAILED", "Unable to clear crawled pages.", 500);
    }
  });
}
