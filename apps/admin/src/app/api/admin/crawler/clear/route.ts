import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function POST() {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const supabase = assertServiceClient();
      const { data: docs } = await supabase
        .from("knowledge_documents")
        .select("id")
        .eq("source_type", "website");

      const ids = (docs ?? []).map((row) => row.id);
      if (ids.length > 0) {
        await supabase.from("knowledge_chunks").delete().in("document_id", ids);
        await supabase.from("knowledge_documents").delete().in("id", ids);
      }

      await safeAudit({
        adminId: admin.id,
        action: "crawler.clear",
        entityType: "crawler",
        details: { deleted: ids.length },
        ipAddress,
      });
      return successResponse({ deleted: ids.length });
    } catch (error) {
      console.error("Crawler clear failed", error);
      return errorResponse("CRAWLER_CLEAR_FAILED", "Unable to clear crawler results.", 500);
    }
  });
}

