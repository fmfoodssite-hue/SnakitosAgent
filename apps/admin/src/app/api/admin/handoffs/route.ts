import { NextResponse } from "next/server";
import { withAdminAccess, parseJson, safeAudit } from "@/lib/server";
import { handoffSchema } from "@/lib/validations";
import { createHandoff, listHandoffs, updateHandoff } from "@/lib/services/handoffs";
import type { Json } from "@/lib/types";

export async function GET() {
  return withAdminAccess(["owner", "admin", "support_agent", "viewer"], async () => {
    const tickets = await listHandoffs();
    return NextResponse.json({ tickets });
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent"], async ({ admin, ipAddress }) => {
    const parsed = await parseJson(request, handoffSchema);
    if (parsed instanceof NextResponse) {
      return parsed;
    }

    const ticket = await createHandoff({
      ...parsed,
      metadata: parsed.metadata as Record<string, Json>,
    });
    await safeAudit({
      adminId: admin.id,
      action: "handoff.create",
      entityType: "handoff_ticket",
      entityId: ticket.id,
      details: { complaintType: ticket.complaint_type, status: ticket.status },
      ipAddress,
    });

    return NextResponse.json({ ticket }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent"], async ({ admin, ipAddress }) => {
    const body = (await request.json()) as { id?: string; status?: string; assigned_to?: string | null };
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const ticket = await updateHandoff(body.id, {
      status: body.status as never,
      assigned_to: body.assigned_to,
    });

    await safeAudit({
      adminId: admin.id,
      action: "handoff.update",
      entityType: "handoff_ticket",
      entityId: body.id,
      details: body,
      ipAddress,
    });

    return NextResponse.json({ ticket });
  });
}
