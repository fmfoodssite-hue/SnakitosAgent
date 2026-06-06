import { AdminPage } from "@/components/dashboard/AdminPage";
import { DataCard } from "@/components/dashboard/DataCard";
import { PageIntro } from "@/components/dashboard/PageIntro";
import { Badge } from "@/components/ui/badge";
import { requirePageAccess } from "@/lib/page-auth";
import { listPromptVersions } from "@/lib/services/prompts";

export default async function PromptControlPage() {
  await requirePageAccess(["owner", "admin", "content_manager", "viewer"]);
  const prompts = await listPromptVersions();

  return (
    <AdminPage>
      <PageIntro eyebrow="Prompt Control" title="Versioned behavior management" description="Edit the system prompt, fallback messaging, language rules, escalation policy, and anti-hallucination instructions with rollback support." />
      <DataCard title="Version History" description="Activate a saved version through `/api/admin/prompts`.">
        <div className="space-y-4">
          {prompts.map((prompt) => (
            <div key={prompt.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{prompt.version_label}</p>
                  <p className="mt-1 text-xs text-zinc-500">{new Date(prompt.created_at).toLocaleString()}</p>
                </div>
                <Badge tone={prompt.is_active ? "success" : "default"}>{prompt.is_active ? "Active" : "Saved"}</Badge>
              </div>
              <p className="mt-3 line-clamp-4 text-sm text-zinc-400">{prompt.system_prompt}</p>
            </div>
          ))}
        </div>
      </DataCard>
    </AdminPage>
  );
}

