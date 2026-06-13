import { withAdminAccess } from "@/lib/server";
import {
  checkCrawlerHealth,
  checkDatabaseHealth,
  checkOpenAIHealth,
  checkShopifyHealth,
  checkVectorDbHealth,
} from "@/lib/health";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const [database, vectorDb, openai, shopify, crawler] = await Promise.all([
        checkDatabaseHealth(),
        checkVectorDbHealth(),
        checkOpenAIHealth(),
        checkShopifyHealth(),
        checkCrawlerHealth(),
      ]);

      return successResponse({
        database,
        vector_db: vectorDb,
        openai_api: openai,
        shopify_api: shopify,
        crawler,
      });
    } catch (error) {
      console.error("System health failed", error);
      return errorResponse("SYSTEM_HEALTH_FAILED", "Unable to load system health.", 500);
    }
  });
}

