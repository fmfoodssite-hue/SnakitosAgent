import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const { id } = await params;
      const body = (await request.json().catch(() => ({}))) as {
        action?: string;
        question?: string;
        answer?: string;
        category?: string;
      };

      const supabase = assertServiceClient();

      if (body.action === "ignore") {
        // Update in failed_answers table
        await supabase
          .from("failed_answers")
          .update({ status: "ignored", updated_at: new Date().toISOString() })
          .eq("id", id);

        // Legacy compat
        await supabase
          .from("chat_messages")
          .update({ is_failed_answer: false, metadata: { failedAnswerStatus: "ignored" } })
          .eq("id", id);

        await safeAudit({
          adminId: admin.id,
          action: "failed_answer.ignore",
          entityType: "failed_answer",
          entityId: id,
          ipAddress,
        });

        return successResponse({ action: "ignored" });
      }

      if (body.action === "fix") {
        await supabase
          .from("failed_answers")
          .update({ status: "resolved", fixed_by: admin.id, fixed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", id);

        await supabase
          .from("chat_messages")
          .update({ is_failed_answer: false, metadata: { failedAnswerStatus: "fixed" } })
          .eq("id", id);

        await safeAudit({
          adminId: admin.id,
          action: "failed_answer.fix",
          entityType: "failed_answer",
          entityId: id,
          ipAddress,
        });

        return successResponse({ action: "fixed" });
      }

      if (body.action === "create_faq") {
        if (!body.question || !body.answer) {
          return errorResponse("VALIDATION_FAILED", "question and answer are required for create_faq.", 400);
        }

        const { data: faq, error: faqError } = await supabase
          .from("knowledge_documents")
          .insert({
            title: body.question,
            category: body.category ?? "General FAQ",
            content: body.answer,
            source_type: "faq",
            priority: "medium",
            status: "active",
            metadata: {
              question: body.question,
              answer: body.answer,
              created_from_failed_answer: id,
            },
            created_by: admin.id,
            updated_by: admin.id,
          })
          .select("id, title")
          .single();

        if (faqError) throw faqError;

        await supabase
          .from("failed_answers")
          .update({ status: "resolved", fixed_by: admin.id, fixed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", id);

        await safeAudit({
          adminId: admin.id,
          action: "failed_answer.create_faq",
          entityType: "failed_answer",
          entityId: id,
          details: { faq_id: faq.id, question: body.question },
          ipAddress,
        });

        return successResponse({ action: "create_faq", faq });
      }

      if (body.action === "create_ticket") {
        const { data: failedAnswer } = await supabase
          .from("failed_answers")
          .select("user_question, bot_answer, chat_session_id")
          .eq("id", id)
          .maybeSingle();

        const { data: ticket, error: ticketError } = await supabase
          .from("handoff_tickets")
          .insert({
            complaint_type: "unknown_order_tracking",
            status: "open",
            summary: failedAnswer?.user_question ?? body.question ?? "Unanswered question",
            proof_required: false,
            assigned_to: admin.id,
            metadata: {
              botAnswer: failedAnswer?.bot_answer ?? body.answer ?? "",
              createdFromFailedAnswer: id,
            },
          })
          .select("id, ticket_number")
          .single();

        if (ticketError) throw ticketError;

        await safeAudit({
          adminId: admin.id,
          action: "failed_answer.create_ticket",
          entityType: "failed_answer",
          entityId: id,
          details: { ticket_id: ticket.id },
          ipAddress,
        });

        return successResponse({ action: "create_ticket", ticket });
      }

      return errorResponse("VALIDATION_FAILED", "Unsupported action. Valid: ignore, fix, create_faq, create_ticket.", 400);
    } catch (error) {
      console.error("Failed answer action failed", error);
      return errorResponse("FAILED_ANSWER_ACTION_FAILED", "Unable to perform action on failed answer.", 500);
    }
  });
}
