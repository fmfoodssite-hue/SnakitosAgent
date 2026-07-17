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
    <div className="rounded-[28px] border border-[#E6DFC9] bg-white p-5 shadow-[0_12px_40px_rgba(45,49,56,0.06)] dark:border-[#E3BE2F]/25 dark:bg-[#373635]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E3BE2F]/20 text-[#C4862D] dark:bg-[#E3BE2F]/15 dark:text-[#F1C36D]">
          <Icon className="h-5 w-5" />
        </div>
        <StatTrendBadge value={metric.trend} />
      </div>
      <div className="mt-5 space-y-2">
        <div className="text-sm font-medium text-[#4B4B49] dark:text-[#EACD7D]">{metric.title}</div>
        <div className="text-3xl font-semibold tracking-tight text-[#2D3138] dark:text-[#FFF7DF]">{metric.value}</div>
        <p className="text-sm text-[#5F5A51] dark:text-[#FFF7DF]/75">{metric.description}</p>
      </div>
    </div>
  );
}
