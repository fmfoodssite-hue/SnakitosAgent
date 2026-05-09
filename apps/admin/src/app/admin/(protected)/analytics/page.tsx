import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";
import { getAnalyticsSnapshot } from "@/lib/admin/data";

export default async function AnalyticsPage() {
  const analytics = await getAnalyticsSnapshot();
  return <AnalyticsDashboard analytics={analytics} />;
}
