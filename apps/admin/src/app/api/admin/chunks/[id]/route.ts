import OpenAI from "openai";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { env } from "@/lib/env";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      const body = (await request.json().catch(() => ({}))) as { action?: string };
      if (body.action !== "reembed") {
        return errorResponse("VALIDATION_FAILED", "Unsupported chunk action.", 400);
      }

      const supabase = assertServiceClient();
      const { data: chunk, error: fetchError } = await supabase
        .from("knowledge_chunks")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !chunk) {
        return errorResponse("NOT_FOUND", "Chunk not found.", 404);
      }

      if (!env.OPENAI_API_KEY) {
        return errorResponse("NOT_CONFIGURED", "OpenAI embeddings are not configured.", 503);
      }

      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const embedding = await openai.embeddings.create({
        model: env.OPENAI_EMBEDDING_MODEL,
        input: String(chunk.content ?? ""),
      });

      const { data, error } = await supabase
        .from("knowledge_chunks")
        .update({
          embedding: embedding.data[0]?.embedding ?? null,
          embedding_status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      await safeAudit({
        adminId: admin.id,
        action: "chunk.reembed",
        entityType: "knowledge_chunk",
        entityId: id,
        ipAddress,
      });

      return successResponse(data);
    } catch (error) {
      console.error("Chunk reembed failed", error);
      return errorResponse("CHUNK_REEMBED_FAILED", "Unable to re-embed chunk.", 500);
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
      const { error } = await supabase.from("knowledge_chunks").delete().eq("id", id);
      if (error) {
        throw error;
      }

      await safeAudit({
        adminId: admin.id,
        action: "chunk.delete",
        entityType: "knowledge_chunk",
        entityId: id,
        ipAddress,
      });

      return successResponse({ id });
    } catch (error) {
      console.error("Chunk delete failed", error);
      return errorResponse("CHUNK_DELETE_FAILED", "Unable to delete chunk.", 500);
    }
  });
}

