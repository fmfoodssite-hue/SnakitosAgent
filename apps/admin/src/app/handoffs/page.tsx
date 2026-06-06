import { AdminPage } from "@/components/dashboard/AdminPage";
import { DataCard } from "@/components/dashboard/DataCard";
import { PageIntro } from "@/components/dashboard/PageIntro";
import { Badge } from "@/components/ui/badge";
import { requirePageAccess } from "@/lib/page-auth";
import { listHandoffs } from "@/lib/services/handoffs";

export default async function HandoffsPage() {
  await requirePageAccess(["owner", "admin", "support_agent", "viewer"]);
  const tickets = await listHandoffs();

  return (
    <AdminPage>
      <PageIntro eyebrow="Handoffs" title="Human support queue" description="Track damaged item, wrong order, refund, payment, allergy, wholesale, and angry customer escalations with status and ownership." />
      <DataCard title="Ticket Queue">
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{ticket.ticket_number}</p>
                  <p className="mt-1 text-xs text-zinc-500">{ticket.summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{ticket.complaint_type}</Badge>
                  <Badge tone={ticket.status === "resolved" ? "success" : ticket.status === "escalated" ? "danger" : "warning"}>{ticket.status}</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DataCard>
    </AdminPage>
  );
}

