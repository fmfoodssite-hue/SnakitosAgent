import { z } from "zod";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export async function GET(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const { searchParams } = new URL(request.url);
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10));
      const offset = (page - 1) * limit;
      const status = searchParams.get("status");

      const supabase = assertServiceClient();
      let query = supabase
        .from("handoff_tickets")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        const statusMap: Record<string, string> = {
          Open: "open", Pending: "in_progress", Resolved: "resolved", Closed: "resolved",
        };
        query = query.eq("status", statusMap[status] ?? status.toLowerCase());
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return successResponse({ tickets: data ?? [], total: count ?? 0, page, limit });
    } catch (error) {
      console.error("Tickets load failed", error);
      return errorResponse("TICKETS_LOAD_FAILED", "Unable to load tickets.", 500);
    }
  });
}

const ticketSchema = z.object({
  title: z.string().min(2).optional(),
  customer_question: z.string().min(2),
  bot_answer: z.string().min(1),
  recommended_reply: z.string().optional().default(""),
  category: z.string().optional().default("playground"),
  priority: z.enum(["High", "Medium", "Low"]).default("Medium"),
  status: z.enum(["Open", "Pending", "Resolved", "Closed"]).default("Open"),
  assigned_to: z.string().optional().default(""),
  resolution_notes: z.string().optional().default(""),
});

function mapPriority(value: string) {
  return value.toLowerCase();
}

function mapStatus(value: string) {
  switch (value) {
    case "Pending":
      return "in_progress";
    case "Resolved":
      return "resolved";
    case "Closed":
      return "closed";
    default:
      return "open";
  }
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const body = await request.json().catch(() => null);
      const parsed = ticketSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse("VALIDATION_FAILED", "Invalid ticket payload.", 400, parsed.error.flatten());
      }

      const supabase = assertServiceClient();
      const { data, error } = await supabase
        .from("handoff_tickets")
        .insert({
          complaint_type: "unknown_order_tracking",
          status: mapStatus(parsed.data.status),
          customer_identifier: null,
          summary: parsed.data.title || parsed.data.customer_question,
          proof_required: false,
          assigned_to: admin.id,
          metadata: {
            botAnswer: parsed.data.bot_answer,
            recommendedReply: parsed.data.recommended_reply,
            resolutionNotes: parsed.data.resolution_notes,
            category: parsed.data.category,
            priority: mapPriority(parsed.data.priority),
          },
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      await safeAudit({
        adminId: admin.id,
        action: "ticket.create",
        entityType: "handoff_ticket",
        entityId: data.id,
        details: { summary: parsed.data.customer_question, priority: parsed.data.priority },
        ipAddress,
      });

      return successResponse(data, { status: 201 });
    } catch (error) {
      console.error("Failed to create ticket", error);
      return errorResponse("TICKET_CREATE_FAILED", "Unable to create ticket.", 500);
    }
  });
}

export async function PATCH(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager"], async ({ admin, ipAddress }) => {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        id?: string;
        status?: string;
        priority?: string;
        assignedTo?: string;
        adminReply?: string;
        internalNotes?: string;
      };

      if (!body.id) {
        return errorResponse("VALIDATION_FAILED", "Ticket id is required.", 400);
      }

      const statusMap: Record<string, string> = {
        Open: "open",
        Pending: "in_progress",
        Resolved: "resolved",
        Closed: "resolved",
      };

      const supabase = assertServiceClient();
      const { data, error } = await supabase
        .from("handoff_tickets")
        .update({
          status: body.status ? statusMap[body.status] ?? "open" : undefined,
          metadata: {
            recommendedReply: body.adminReply ?? "",
            internalNotes: body.internalNotes ?? "",
            priority: body.priority?.toLowerCase() ?? "medium",
            assignedToName: body.assignedTo ?? "",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.id)
        .select("*")
        .single();

      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "ticket.update",
        entityType: "handoff_ticket",
        entityId: body.id,
        details: body,
        ipAddress,
      });

      return successResponse(data);
    } catch (error) {
      console.error("Ticket update failed", error);
      return errorResponse("TICKET_UPDATE_FAILED", "Unable to update ticket.", 500);
    }
  });
}
