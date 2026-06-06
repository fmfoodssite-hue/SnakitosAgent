import { AdminPage } from "@/components/dashboard/AdminPage";
import { DataCard } from "@/components/dashboard/DataCard";
import { PageIntro } from "@/components/dashboard/PageIntro";
import { StatCard } from "@/components/dashboard/StatCard";
import { Badge } from "@/components/ui/badge";
import { requirePageAccess } from "@/lib/page-auth";
import { getDashboardData } from "@/lib/services/dashboard";
import type { Json } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  await requirePageAccess(["owner", "admin", "support_agent", "content_manager", "viewer"]);
  const { overview, activePrompt, settings } = await getDashboardData();
  const typedSettings = settings as Array<{
    id: string;
    key: string;
    description?: string | null;
    value: Record<string, Json>;
  }>;

  const metrics = [
    { title: "Total Chats", value: overview.totalChats, helper: "Captured customer messages and AI responses." },
    { title: "Knowledge Documents", value: overview.totalKnowledgeDocuments, helper: "Manual, FAQ, Shopify, and uploaded content." },
    { title: "Total Chunks", value: overview.totalChunks, helper: "Embedded units available to the RAG retriever." },
    { title: "Failed Questions", value: overview.failedQuestions, helper: "Messages marked as uncertain or unanswered.", tone: "danger" as const },
    { title: "Human Handoffs", value: overview.humanHandoffs, helper: "Escalations to support and sensitive issue routing.", tone: "warning" as const },
    { title: "Order Tracking Requests", value: overview.orderTrackingRequests, helper: "Conversations involving verification-dependent order help." },
  ];

  return (
    <AdminPage>
      <PageIntro
        eyebrow="Overview"
        title="Production dashboard for Snakitos RAG operations"
        description="Monitor the support assistant, knowledge health, prompt posture, ingestion pipeline, and support handoffs from one place."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <StatCard key={metric.title} {...metric} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DataCard title="Prompt Status" description="Current assistant behavior configuration">
          {activePrompt ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge tone={activePrompt.is_active ? "success" : "default"}>
                  {activePrompt.is_active ? "Active" : "Draft"}
                </Badge>
                <span className="text-sm text-zinc-300">{activePrompt.version_label}</span>
              </div>
              <p className="line-clamp-5 text-sm text-zinc-400">{activePrompt.system_prompt}</p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No prompt versions found yet.</p>
          )}
        </DataCard>

        <DataCard title="Operational Settings" description="Order verification, social links, and guardrails">
          <div className="space-y-3">
            {typedSettings.map((setting) => (
              <div key={setting.key} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{setting.key}</p>
                  <Badge>{Object.keys(setting.value ?? {}).length} keys</Badge>
                </div>
                <p className="mt-2 text-xs text-zinc-500">{setting.description}</p>
              </div>
            ))}
          </div>
        </DataCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DataCard title="Most Asked Questions">
          <div className="space-y-3">
            {overview.mostAskedQuestions.length ? overview.mostAskedQuestions.map((question) => (
              <div key={question} className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-zinc-300">
                {question}
              </div>
            )) : <p className="text-sm text-zinc-500">No conversation data yet.</p>}
          </div>
        </DataCard>

        <DataCard title="Most Recommended Products">
          <div className="space-y-3">
            {overview.mostRecommendedProducts.length ? overview.mostRecommendedProducts.map((product) => (
              <div key={product} className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-zinc-300">
                {product}
              </div>
            )) : <p className="text-sm text-zinc-500">No synced products yet.</p>}
          </div>
        </DataCard>
      </div>
    </AdminPage>
  );
}
