import { LiveMonitor } from "@/components/dashboard/live-monitor";
import { MetricCard } from "@/components/dashboard/metric-card";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardSnapshot } from "@/lib/admin/data";

export default async function DashboardPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <div className="space-y-6">
      {snapshot.alert ? (
        <Card className="border-amber-400/20 bg-amber-400/10">
          <CardContent className="p-5 text-sm text-amber-100">{snapshot.alert}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {snapshot.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <LiveMonitor initialRows={snapshot.liveFeed} />
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-white">Training queue</h3>
              <p className="mt-1 text-sm text-slate-400">
                Most frequent unresolved misses to convert into better grounded answers.
              </p>
            </div>
            <Badge variant="warning">{snapshot.failedQuestions.length} high priority</Badge>
          </div>
          <div className="space-y-3">
            {snapshot.failedQuestions.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{item.question}</p>
                  <span className="text-xs text-slate-500">{item.frequency}x</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{item.suggestedAnswer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AnalyticsDashboard analytics={snapshot.analytics} />
    </div>
  );
}
