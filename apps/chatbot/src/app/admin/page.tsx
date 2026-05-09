import React from "react";
import { MessageSquare, TimerReset, ShieldCheck, Database } from "lucide-react";
import { supabaseService } from "@/server/services/supabase.service";

type AuditRow = {
  id: string;
  userId: string;
  chatId: string;
  query: string;
  response: string;
  createdAt: string;
  responseTimeMs: number;
  status: string;
};

export const dynamic = "force-dynamic";

async function getAuditRows(): Promise<AuditRow[]> {
  try {
    const logs = await supabaseService.getRecentLogs(100);

    return logs
      .filter((row) => String(row.event ?? "") === "chat_processed")
      .map((row, index) => {
        const metadata =
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};

        return {
          id: String(row.id ?? `log-${index}`),
          userId: String(metadata.userId ?? "unknown-user"),
          chatId: String(metadata.chatId ?? "unknown-session"),
          query: String(metadata.userMessage ?? metadata.query ?? "No query captured"),
          response: String(metadata.response ?? "No response captured"),
          createdAt: String(row.created_at ?? new Date().toISOString()),
          responseTimeMs: Number(metadata.responseTimeMs ?? 0),
          status: String(metadata.status ?? "success"),
        } satisfies AuditRow;
      })
      .filter((row) => row.query || row.response);
  } catch {
    return [];
  }
}

function formatDuration(ms: number): string {
  if (!ms || ms < 1000) {
    return `${ms || 0}ms`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

export default async function AdminDashboard() {
  const rows = await getAuditRows();
  const sessionCount = new Set(rows.map((row) => row.chatId)).size;
  const avgResponseMs = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.responseTimeMs, 0) / rows.length)
    : 0;
  const successRate = rows.length
    ? Math.round((rows.filter((row) => row.status === "success").length / rows.length) * 100)
    : 0;

  const stats = [
    { label: "Total Conversations", value: `${sessionCount}`, icon: MessageSquare, color: "text-blue-400" },
    { label: "Avg Response Time", value: formatDuration(avgResponseMs), icon: TimerReset, color: "text-emerald-400" },
    { label: "AI Success Rate", value: `${successRate}%`, icon: ShieldCheck, color: "text-purple-400" },
    { label: "Audit Source", value: rows.length > 0 ? "Live" : "No data", icon: Database, color: "text-orange-400" },
  ];

  return (
    <main className="min-h-screen bg-[#0f172a] p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-12 flex items-center justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-3xl font-bold text-transparent">
              Agent Control Center
            </h1>
            <p className="mt-1 text-slate-400">Real-time monitoring and tracking</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2">
            <span className="block text-xs uppercase text-slate-500">Status</span>
            <span className="font-medium text-green-400">Operational</span>
          </div>
        </header>

        <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
                <span className="text-sm font-medium text-slate-400">{stat.label}</span>
              </div>
              <div className={`mt-3 text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/30">
          <div className="border-b border-slate-700/50 p-6">
            <h2 className="text-xl font-semibold">Live Chat Tracking</h2>
            <p className="mt-1 text-sm text-slate-400">Latest captured user queries and bot replies.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900/50 text-sm text-slate-400">
                  <th className="p-4 font-medium">Time</th>
                  <th className="p-4 font-medium">User</th>
                  <th className="p-4 font-medium">Query</th>
                  <th className="p-4 font-medium">Agent Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {rows.length > 0 ? (
                  rows.slice(0, 20).map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-700/20">
                      <td className="whitespace-nowrap p-4 text-sm text-slate-400">
                        {new Date(row.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="p-4">
                        <span className="rounded bg-blue-500/10 px-2 py-1 text-xs text-blue-400">
                          {row.userId}
                        </span>
                      </td>
                      <td className="max-w-xs truncate p-4 text-sm text-slate-300">{row.query}</td>
                      <td className="max-w-xs truncate p-4 text-sm italic text-slate-500">
                        {row.response}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-sm text-slate-500">
                      No live chat logs found yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
