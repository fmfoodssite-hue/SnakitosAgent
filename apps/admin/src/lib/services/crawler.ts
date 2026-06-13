import { createHash } from "crypto";
import { assertServiceClient } from "@/lib/db";

type CrawlResult = {
  url: string;
  title: string | null;
  content: string;
  httpStatus: number;
  contentHash: string;
  error: string | null;
};

type SitemapUrl = {
  loc: string;
  lastmod?: string;
};

// ---------------------------------------------------------------------------
// FETCH & EXTRACT
// ---------------------------------------------------------------------------

async function fetchPageContent(url: string, timeoutMs = 10000): Promise<CrawlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SnakitosBot/1.0 (knowledge-crawler)" },
    });

    clearTimeout(timer);
    const html = await response.text();

    // Strip HTML tags for plain text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50000); // Cap content at 50k chars per page

    // Extract title
    const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    const title = titleMatch?.[1]?.trim() ?? null;

    const hash = createHash("sha256").update(text).digest("hex");

    return {
      url,
      title,
      content: text,
      httpStatus: response.status,
      contentHash: hash,
      error: null,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      url,
      title: null,
      content: "",
      httpStatus: 0,
      contentHash: "",
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
  }
}

// ---------------------------------------------------------------------------
// SITEMAP PARSING
// ---------------------------------------------------------------------------

export async function parseSitemap(sitemapUrl: string): Promise<string[]> {
  try {
    const response = await fetch(sitemapUrl, {
      headers: { "User-Agent": "SnakitosBot/1.0" },
    });
    if (!response.ok) return [];

    const xml = await response.text();
    const locs: string[] = [];
    const locRegex = /<loc>([^<]+)<\/loc>/g;
    let match: RegExpExecArray | null;

    while ((match = locRegex.exec(xml)) !== null) {
      const loc = match[1]?.trim();
      if (loc) locs.push(loc);
    }

    return locs.slice(0, 200); // Max 200 URLs per sitemap
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// CRAWL SINGLE PAGE
// ---------------------------------------------------------------------------

export async function crawlPage(url: string, sourceId?: string | null): Promise<{
  status: "saved" | "skipped" | "error";
  id?: string;
  url: string;
  reason?: string;
}> {
  if (!url || !URL.canParse(url)) {
    return { status: "error", url, reason: "Invalid URL" };
  }

  const supabase = assertServiceClient();
  const result = await fetchPageContent(url);

  if (result.error) {
    await supabase.from("crawled_pages").upsert(
      {
        url,
        status: "error",
        http_status: result.httpStatus,
        error_message: result.error,
        last_crawled_at: new Date().toISOString(),
        source_id: sourceId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "url" },
    );
    return { status: "error", url, reason: result.error };
  }

  // Check if content has changed
  const { data: existing } = await supabase
    .from("crawled_pages")
    .select("id, content_hash")
    .eq("url", url)
    .maybeSingle();

  if (existing?.content_hash === result.contentHash) {
    // Content unchanged — update last_crawled_at only
    await supabase
      .from("crawled_pages")
      .update({ last_crawled_at: new Date().toISOString(), http_status: result.httpStatus })
      .eq("id", existing.id);

    return { status: "skipped", url, reason: "Content unchanged" };
  }

  const { data: saved, error: saveError } = await supabase
    .from("crawled_pages")
    .upsert(
      {
        url,
        title: result.title,
        content: result.content,
        content_hash: result.contentHash,
        status: result.httpStatus >= 200 && result.httpStatus < 300 ? "success" : "error",
        http_status: result.httpStatus,
        last_crawled_at: new Date().toISOString(),
        source_id: sourceId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "url" },
    )
    .select("id")
    .maybeSingle();

  if (saveError) {
    return { status: "error", url, reason: saveError.message };
  }

  return { status: "saved", id: saved?.id, url };
}

// ---------------------------------------------------------------------------
// CRAWL MULTIPLE URLS
// ---------------------------------------------------------------------------

export async function crawlUrls(
  urls: string[],
  options: { sourceId?: string | null; adminId?: string; maxConcurrent?: number } = {},
): Promise<{
  total: number;
  saved: number;
  skipped: number;
  errors: number;
  results: Array<{ status: string; url: string; reason?: string }>;
}> {
  const { sourceId, maxConcurrent = 3 } = options;
  const results: Array<{ status: string; url: string; reason?: string }> = [];

  // Process in batches to avoid overwhelming the target server
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(batch.map((url) => crawlPage(url, sourceId)));
    results.push(...batchResults);

    // Brief pause between batches to be polite
    if (i + maxConcurrent < urls.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return {
    total: results.length,
    saved: results.filter((r) => r.status === "saved").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  };
}

// ---------------------------------------------------------------------------
// STOP ALL RUNNING CRAWLS
// ---------------------------------------------------------------------------

export async function stopActiveCrawls(): Promise<{ cancelled: number }> {
  const supabase = assertServiceClient();
  const { data } = await supabase
    .from("ingestion_jobs")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .eq("job_type", "website_crawl")
    .select("id");

  return { cancelled: (data ?? []).length };
}

// ---------------------------------------------------------------------------
// LIST CRAWLED PAGES
// ---------------------------------------------------------------------------

export async function listCrawledPages(options: {
  page?: number;
  limit?: number;
  status?: string;
} = {}) {
  const supabase = assertServiceClient();
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, options.limit ?? 20);
  const offset = (page - 1) * limit;

  let query = supabase
    .from("crawled_pages")
    .select("*", { count: "exact" })
    .order("last_crawled_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { pages: data ?? [], total: count ?? 0, page, limit };
}
