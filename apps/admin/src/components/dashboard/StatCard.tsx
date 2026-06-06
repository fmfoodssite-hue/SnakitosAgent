import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({
  title,
  value,
  helper,
  tone = "default",
}: {
  title: string;
  value: string | number;
  helper?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <Card className="min-h-[160px]">
      <CardHeader>
        <div>
          <CardDescription>{title}</CardDescription>
          <CardTitle className="mt-3 text-3xl">{value}</CardTitle>
        </div>
        <Badge tone={tone}>
          <ArrowUpRight className="mr-1 h-3 w-3" />
          Live
        </Badge>
      </CardHeader>
      {helper ? <CardContent><p className="text-sm text-zinc-500">{helper}</p></CardContent> : null}
    </Card>
  );
}

