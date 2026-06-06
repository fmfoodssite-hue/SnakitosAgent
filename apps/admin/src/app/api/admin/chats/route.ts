import { NextResponse } from "next/server";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { listChatSessions, markMessageForReview } from "@/lib/services/chats";

export async function GET() {
  return withAdminAccess(["owner", "admin", "support_agent", "viewer"], async () => {
    const sessions = await listChatSessions();
    return NextResponse.json({ sessions });
  });
}

export async function PATCH(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent"], async ({ admin, ipAddress }) => {
    const body = (await request.json()) as { messageId?: string };
    if (!body.messageId) {
      return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    }

    const message = await markMessageForReview(body.messageId, admin.id);
    await safeAudit({
      adminId: admin.id,
      action: "chat.mark_for_review",
      entityType: "chat_message",
      entityId: body.messageId,
      ipAddress,
    });

    return NextResponse.json({ message });
  });
}

