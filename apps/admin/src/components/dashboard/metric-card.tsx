import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardMetric } from "@/lib/admin/types";

export function MetricCard({ metric }: { metric: DashboardMetric }) {
  const icon =
    metric.trend === "up" ? (
      <ArrowUpRight className="h-4 w-4 text-emerald-300" />
    ) : metric.trend === "down" ? (
      <ArrowDownRight className="h-4 w-4 text-rose-300" />
    ) : (
      <Minus className="h-4 w-4 text-slate-400" />
    );

  return (
    <Card>
      <CardHeader className="pb-3">
        <p className="text-sm text-slate-400">{metric.label}</p>
        <CardTitle className="text-3xl">{metric.value}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <p className="max-w-[16rem] text-sm text-slate-500">{metric.helpText}</p>
        <div className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-sm text-slate-200">
          {icon}
          {metric.delta}
        </div>
      </CardContent>
    </Card>
  );
}
