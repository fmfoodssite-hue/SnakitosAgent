import { AdminPage } from "@/components/dashboard/AdminPage";
import { DataCard } from "@/components/dashboard/DataCard";
import { PageIntro } from "@/components/dashboard/PageIntro";
import { requirePageAccess } from "@/lib/page-auth";
import { listSettings } from "@/lib/services/settings";

export default async function SettingsPage() {
  await requirePageAccess(["owner", "admin", "viewer"]);
  const settings = (await listSettings()) as Array<{
    id: string;
    key: string;
    description?: string | null;
    value: Record<string, unknown>;
  }>;

  return (
    <AdminPage>
      <PageIntro eyebrow="Settings" title="Verification and operational controls" description="Configure order tracking requirements, fallback support messages, social links, and other admin-managed behavior values." />
      <div className="space-y-6">
        {settings.map((setting) => (
          <DataCard key={setting.id} title={setting.key} description={setting.description ?? undefined}>
            <pre className="overflow-x-auto rounded-2xl bg-black/20 p-4 text-xs text-zinc-300">
              {JSON.stringify(setting.value, null, 2)}
            </pre>
          </DataCard>
        ))}
      </div>
    </AdminPage>
  );
}
