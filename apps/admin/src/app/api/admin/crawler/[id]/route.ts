import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

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

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      const supabase = assertServiceClient();
      const { data: doc, error: fetchError } = await supabase
        .from("knowledge_documents")
        .select("*")
        .eq("id", id)
        .eq("source_type", "website")
        .single();

      if (fetchError || !doc) {
        return errorResponse("NOT_FOUND", "Crawler page not found.", 404);
      }

      const url = String((doc.metadata as Record<string, unknown> | null)?.url ?? "");
      if (!url) {
        return errorResponse("VALIDATION_FAILED", "Crawler page URL is missing.", 400);
      }

      const response = await fetch(url, { cache: "no-store" });
      const html = await response.text();
      const text = stripHtml(html);
      await supabase.from("knowledge_chunks").delete().eq("document_id", id);
      const chunks = chunkText(text).map((content, index) => ({
        document_id: id,
        chunk_index: index,
        content,
        token_estimate: Math.ceil(content.length / 4),
        embedding_status: "pending",
        metadata: { url },
      }));
      if (chunks.length > 0) {
        await supabase.from("knowledge_chunks").insert(chunks);
      }
      const { data, error } = await supabase
        .from("knowledge_documents")
        .update({
          content: text,
          status: response.ok ? "active" : "archived",
          updated_by: admin.id,
          updated_at: new Date().toISOString(),
          metadata: {
            ...(doc.metadata as Record<string, unknown>),
            httpStatus: response.status,
            crawledAt: new Date().toISOString(),
          },
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "crawler.recrawl",
        entityType: "knowledge_document",
        entityId: id,
        ipAddress,
      });
      return successResponse(data);
    } catch (error) {
      console.error("Crawler recrawl failed", error);
      return errorResponse("CRAWLER_RECRAWL_FAILED", "Unable to re-crawl page.", 500);
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
      await supabase.from("knowledge_chunks").delete().eq("document_id", id);
      await supabase.from("knowledge_documents").delete().eq("id", id).eq("source_type", "website");

      await safeAudit({
        adminId: admin.id,
        action: "crawler.delete",
        entityType: "knowledge_document",
        entityId: id,
        ipAddress,
      });
      return successResponse({ id });
    } catch (error) {
      console.error("Crawler delete failed", error);
      return errorResponse("CRAWLER_DELETE_FAILED", "Unable to delete crawler result.", 500);
    }
  });
}

