import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";
import { crawlPage } from "@/lib/services/crawler";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      const supabase = assertServiceClient();

      const { data: page, error: pageError } = await supabase
        .from("crawled_pages")
        .select("url, source_id")
        .eq("id", id)
        .single();

      if (pageError || !page) {
        return errorResponse("PAGE_NOT_FOUND", "Crawled page not found.", 404);
      }

      const result = await crawlPage(page.url, page.source_id);

      await safeAudit({
        adminId: admin.id,
        action: "crawler.recrawl",
        entityType: "crawled_page",
        entityId: id,
        details: { url: page.url, status: result.status },
        ipAddress,
      });

      return successResponse(result);
    } catch (error) {
      console.error("Recrawl failed", error);
      return errorResponse("RECRAWL_FAILED", "Unable to recrawl page.", 500);
    }
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      const supabase = assertServiceClient();
      const { error } = await supabase.from("crawled_pages").delete().eq("id", id);
      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "crawler.delete_page",
        entityType: "crawled_page",
        entityId: id,
        ipAddress,
      });

      return successResponse({ deleted: true });
    } catch (error) {
      console.error("Crawled page delete failed", error);
      return errorResponse("CRAWLED_PAGE_DELETE_FAILED", "Unable to delete crawled page.", 500);
    }
  });
}
