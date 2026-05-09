"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatMessageRecord } from "@/lib/admin/types";

export function LiveMonitor({ initialRows }: { initialRows: ChatMessageRecord[] }) {
  const [rows, setRows] = useState(initialRows);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const response = await fetch("/api/admin/chats");
      if (!response.ok) return;
      const payload = (await response.json()) as { rows: ChatMessageRecord[] };
      setRows(payload.rows.slice(0, 5));
    }, 15000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Real-time monitoring</CardTitle>
        <CardDescription>Polls latest conversations so operators can watch live quality.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-white">{row.userQuery}</p>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{row.intent}</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">{row.aiResponse}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
