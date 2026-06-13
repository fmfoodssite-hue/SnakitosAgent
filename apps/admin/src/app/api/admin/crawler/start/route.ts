import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

type CrawlerSettingsPayload = {
  websiteUrl: string;
  depth: number;
  includePatterns: string;
  excludePatterns: string;
  autoDetectProductPages: boolean;
  autoDetectFaqPages: boolean;
  autoDetectPolicyPages: boolean;
  respectRobots: boolean;
};

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkText(input: string, size = 900) {
  const chunks: string[] = [];
  for (let index = 0; index < input.length; index += size) {
    const chunk = input.slice(index, index + size).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

function buildCandidateUrls(settings: CrawlerSettingsPayload) {
  const base = settings.websiteUrl.replace(/\/$/, "");
  const includePaths = settings.includePatterns
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((path) => (path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`));

  return [base, ...includePaths].slice(0, 10);
}

async function crawlUrl(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const html = await response.text();
  const text = stripHtml(html);
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);

  return {
    url,
    ok: response.ok,
    status: response.status,
    title: titleMatch?.[1]?.trim() || url,
    text,
  };
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const settings = (await request.json().catch(() => null)) as CrawlerSettingsPayload | null;
      if (!settings?.websiteUrl) {
        return errorResponse("VALIDATION_FAILED", "Crawler websiteUrl is required.", 400);
      }

      const supabase = assertServiceClient();
      const urls = buildCandidateUrls(settings);
      const results = await Promise.allSettled(urls.map((url) => crawlUrl(url)));

      await supabase.from("settings").upsert({
        key: "crawler_settings",
        value: settings,
        description: "Crawler settings",
        updated_by: admin.id,
        updated_at: new Date().toISOString(),
      });

      await supabase.from("settings").upsert({
        key: "crawler_runtime",
        value: { running: false, lastStartedAt: new Date().toISOString() },
        description: "Crawler runtime status",
        updated_by: admin.id,
        updated_at: new Date().toISOString(),
      });

      const created: Array<Record<string, unknown>> = [];

      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const page = result.value;
        if (!page.ok || !page.text) continue;

        const { data: document, error: documentError } = await supabase
          .from("knowledge_documents")
          .insert({
            title: page.title,
            category: "General FAQ",
            content: page.text,
            source_type: "website",
            priority: "medium",
            status: "active",
            created_by: admin.id,
            updated_by: admin.id,
            metadata: {
              url: page.url,
              pageType: "Page",
              httpStatus: page.status,
              crawledAt: new Date().toISOString(),
            },
          })
          .select("*")
          .single();

        if (documentError || !document) continue;

        const chunks = chunkText(page.text).map((content, index) => ({
          document_id: document.id,
          chunk_index: index,
          content,
          token_estimate: Math.ceil(content.length / 4),
          embedding_status: "pending",
          metadata: { url: page.url },
        }));

        if (chunks.length > 0) {
          await supabase.from("knowledge_chunks").insert(chunks);
        }

        created.push(document);
      }

      await safeAudit({
        adminId: admin.id,
        action: "crawler.start",
        entityType: "crawler",
        details: { urlCount: urls.length, created: created.length },
        ipAddress,
      });

      return successResponse({ created });
    } catch (error) {
      console.error("Crawler start failed", error);
      return errorResponse("CRAWLER_START_FAILED", "Unable to start crawler.", 500);
    }
  });
}

