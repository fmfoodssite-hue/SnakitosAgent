import { AdminPage } from "@/components/dashboard/AdminPage";
import { DataCard } from "@/components/dashboard/DataCard";
import { PageIntro } from "@/components/dashboard/PageIntro";
import { requirePageAccess } from "@/lib/page-auth";
import { getDeepAnalytics } from "@/lib/services/analytics";

export default async function AnalyticsPage() {
  await requirePageAccess(["owner", "admin", "support_agent", "content_manager", "viewer"]);
  const analytics = await getDeepAnalytics();
  const failedQuestions = analytics.topFailedQuestions as Array<{ user_message: string }>;
  const topProducts = analytics.topProductsRecommended as Array<{ title: string }>;

  return (
    <AdminPage>
      <PageIntro eyebrow="Analytics" title="Support and conversion intelligence" description="Review top questions, failed answers, recommended products, complaint types, language distribution, and unanswered conversation patterns." />
      <div className="grid gap-6 lg:grid-cols-2">
        <DataCard title="Top Failed Questions">
          <div className="space-y-3">
            {failedQuestions.map((row, index) => (
              <div key={`${row.user_message}-${index}`} className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-zinc-300">
                {row.user_message}
              </div>
            ))}
          </div>
        </DataCard>
        <DataCard title="Top Recommended Products">
          <div className="space-y-3">
            {topProducts.map((row, index) => (
              <div key={`${row.title}-${index}`} className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-zinc-300">
                {row.title}
              </div>
            ))}
          </div>
        </DataCard>
      </div>
    </AdminPage>
  );
}
