import { z } from "zod";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

const faqSchema = z.object({
  id: z.string().uuid().optional(),
  question: z.string().min(2),
  answer: z.string().min(2),
  category: z.string().min(2),
  language: z.string().min(2),
  status: z.enum(["Active", "Disabled"]),
  tags: z.array(z.string()).default([]),
});

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const supabase = assertServiceClient();
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("*")
        .eq("source_type", "faq")
        .order("updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      return successResponse(data ?? []);
    } catch (error) {
      console.error("Failed to load FAQs", error);
      return errorResponse("FAQ_LOAD_FAILED", "Unable to load FAQs.", 500);
    }
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const body = await request.json().catch(() => null);
      const parsed = faqSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse("VALIDATION_FAILED", "Invalid FAQ payload.", 400, parsed.error.flatten());
      }

      const supabase = assertServiceClient();
      const payload = {
        title: parsed.data.question,
        category: parsed.data.category,
        content: parsed.data.answer,
        source_type: "faq",
        priority: "medium",
        status: parsed.data.status === "Active" ? "active" : "draft",
        metadata: {
          question: parsed.data.question,
          answer: parsed.data.answer,
          language: parsed.data.language,
          tags: parsed.data.tags,
        },
        created_by: admin.id,
        updated_by: admin.id,
        updated_at: new Date().toISOString(),
      };

      const query = parsed.data.id
        ? supabase
            .from("knowledge_documents")
            .update(payload)
            .eq("id", parsed.data.id)
            .select("*")
            .single()
        : supabase.from("knowledge_documents").insert(payload).select("*").single();

      const { data, error } = await query;
      if (error) {
        throw error;
      }

      await safeAudit({
        adminId: admin.id,
        action: parsed.data.id ? "faq.update" : "faq.create",
        entityType: "knowledge_document",
        entityId: data.id,
        details: { question: parsed.data.question, category: parsed.data.category },
        ipAddress,
      });

      return successResponse(data, { status: parsed.data.id ? 200 : 201 });
    } catch (error) {
      console.error("Failed to save FAQ", error);
      return errorResponse("FAQ_SAVE_FAILED", "Unable to save FAQ.", 500);
    }
  });
}
