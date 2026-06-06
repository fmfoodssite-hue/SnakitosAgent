import { AdminPage } from "@/components/dashboard/AdminPage";
import { DataCard } from "@/components/dashboard/DataCard";
import { PageIntro } from "@/components/dashboard/PageIntro";
import { Badge } from "@/components/ui/badge";
import { requirePageAccess } from "@/lib/page-auth";
import { listAuditLogs } from "@/lib/services/audit-logs";

export default async function AuditLogsPage() {
  await requirePageAccess(["owner", "admin", "viewer"]);
  const logs = (await listAuditLogs()) as Array<{
    id: string;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    created_at: string;
  }>;

  return (
    <AdminPage>
      <PageIntro eyebrow="Audit Logs" title="Every sensitive admin action" description="Authentication, knowledge edits, prompt publishes, sync jobs, and ticket changes are written to the audit trail." />
      <DataCard title="Recent Activity">
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{log.action}</p>
                  <p className="mt-1 text-xs text-zinc-500">{log.entity_type} • {log.entity_id ?? "n/a"}</p>
                </div>
                <Badge>{new Date(log.created_at).toLocaleString()}</Badge>
              </div>
            </div>
          ))}
        </div>
      </DataCard>
    </AdminPage>
  );
}
