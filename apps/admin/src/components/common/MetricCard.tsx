import {
  BadgeCheck,
  Coins,
  DatabaseZap,
  HeartHandshake,
  MessagesSquare,
  PackageSearch,
  TimerReset,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { StatTrendBadge } from "@/components/common/StatTrendBadge";
import type { DashboardMetric } from "@/types";

const iconMap: Record<string, LucideIcon> = {
  MessagesSquare,
  BadgeCheck,
  TriangleAlert,
  PackageSearch,
  DatabaseZap,
  TimerReset,
  Coins,
  HeartHandshake,
};

export function MetricCard({ metric }: { metric: DashboardMetric }) {
  const Icon = iconMap[metric.icon] ?? MessagesSquare;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Icon className="h-5 w-5" />
        </div>
        <StatTrendBadge value={metric.trend} />
      </div>
      <div className="mt-5 space-y-2">
        <div className="text-sm font-medium text-slate-500">{metric.title}</div>
        <div className="text-3xl font-semibold tracking-tight text-slate-950">{metric.value}</div>
        <p className="text-sm text-slate-600">{metric.description}</p>
      </div>
    </div>
  );
}
