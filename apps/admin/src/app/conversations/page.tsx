import { AdminPage } from "@/components/dashboard/AdminPage";
import { DataCard } from "@/components/dashboard/DataCard";
import { PageIntro } from "@/components/dashboard/PageIntro";
import { Badge } from "@/components/ui/badge";
import { requirePageAccess } from "@/lib/page-auth";
import { listChatSessions } from "@/lib/services/chats";

export default async function ConversationsPage() {
  await requirePageAccess(["owner", "admin", "support_agent", "viewer"]);
  const sessions = (await listChatSessions()) as Array<{
    id: string;
    session_id: string;
    language?: string | null;
    page_url?: string | null;
    handoff_status: string;
    chat_messages?: Array<{
      id: string;
      user_message: string;
      ai_response?: string | null;
      detected_intent?: string | null;
      is_failed_answer: boolean;
      marked_for_review: boolean;
    }>;
  }>;

  return (
    <AdminPage>
      <PageIntro eyebrow="Conversations" title="Conversation inbox and review queue" description="Search and review chats, flag failed answers, inspect retrieved sources, and assign sensitive interactions to support." />
      <div className="space-y-6">
        {sessions.map((session) => (
          <DataCard
            key={session.id}
            title={session.session_id}
            description={`${session.language ?? "unknown language"} • ${session.page_url ?? "unknown page"}`}
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge>{session.handoff_status}</Badge>
                <Badge>{session.chat_messages?.length ?? 0} messages</Badge>
              </div>
              {(session.chat_messages ?? []).slice(0, 2).map((message) => (
                <div key={message.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                  <p className="text-sm text-white">{message.user_message}</p>
                  <p className="mt-2 text-sm text-zinc-400">{message.ai_response}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge>{message.detected_intent ?? "unknown_intent"}</Badge>
                    {message.is_failed_answer ? <Badge tone="danger">Failed answer</Badge> : null}
                    {message.marked_for_review ? <Badge tone="warning">Marked for review</Badge> : null}
                  </div>
                </div>
              ))}
            </div>
          </DataCard>
        ))}
      </div>
    </AdminPage>
  );
}
