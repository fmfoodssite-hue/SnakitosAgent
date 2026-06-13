import { z } from "zod";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { errorResponse, successResponse } from "@/lib/response";
import { parseSitemap, crawlUrls, listCrawledPages } from "@/lib/services/crawler";

export const dynamic = "force-dynamic";

const crawlSchema = z.object({
  url: z.string().url().optional(),
  sitemap_url: z.string().url().optional(),
  urls: z.array(z.string().url()).max(50).optional(),
  source_id: z.string().uuid().optional().nullable(),
});

export async function GET(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const { searchParams } = new URL(request.url);
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10));
      const status = searchParams.get("status") ?? undefined;

      const result = await listCrawledPages({ page, limit, status });
      return successResponse(result);
    } catch (error) {
      console.error("Crawled pages load failed", error);
      return errorResponse("CRAWLED_PAGES_FAILED", "Unable to load crawled pages.", 500);
    }
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const body = await request.json().catch(() => null);
      const parsed = crawlSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse("VALIDATION_FAILED", "Provide url, sitemap_url, or urls array.", 400, parsed.error.flatten());
      }

      const { url, sitemap_url, urls, source_id } = parsed.data;

      // Collect all URLs to crawl
      const allUrls: string[] = [];

      if (url) allUrls.push(url);
      if (urls) allUrls.push(...urls);

      if (sitemap_url) {
        const sitemapUrls = await parseSitemap(sitemap_url);
        allUrls.push(...sitemapUrls);
      }

      if (allUrls.length === 0) {
        return errorResponse("VALIDATION_FAILED", "No valid URLs to crawl.", 400);
      }

      // Deduplicate
      const uniqueUrls = [...new Set(allUrls)].slice(0, 50);

      // Start crawl
      const result = await crawlUrls(uniqueUrls, {
        sourceId: source_id ?? null,
        adminId: admin.id,
        maxConcurrent: 3,
      });

      await safeAudit({
        adminId: admin.id,
        action: "crawler.start",
        entityType: "crawled_pages",
        details: {
          total: result.total,
          saved: result.saved,
          skipped: result.skipped,
          errors: result.errors,
          first_url: uniqueUrls[0],
        },
        ipAddress,
      });

      return successResponse(result, { status: 201 });
    } catch (error) {
      console.error("Crawl start failed", error);
      return errorResponse("CRAWL_START_FAILED", "Unable to start crawl.", 500);
    }
  });
}
