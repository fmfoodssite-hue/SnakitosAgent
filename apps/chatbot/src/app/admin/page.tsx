import React from "react";
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

function statCard(label: string, value: string, accent: string) {
  return (
    <div
      key={label}
      style={{
        background: "linear-gradient(180deg, rgba(30,41,59,0.88), rgba(15,23,42,0.95))",
        border: "1px solid rgba(148,163,184,0.18)",
        borderRadius: 20,
        padding: 24,
        boxShadow: "0 10px 30px rgba(2, 6, 23, 0.28)",
      }}
    >
      <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, letterSpacing: "0.02em" }}>
        {label}
      </div>
      <div style={{ color: accent, fontSize: 30, fontWeight: 800, marginTop: 10 }}>{value}</div>
    </div>
  );
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

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(37,99,235,0.16), transparent 28%), linear-gradient(180deg, #020617 0%, #0f172a 55%, #111827 100%)",
        color: "#f8fafc",
        padding: "32px 16px",
        fontFamily:
          "var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 36,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 48,
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: "-0.03em",
              }}
            >
              Agent Control Center
            </h1>
            <p style={{ margin: "12px 0 0", color: "#94a3b8", fontSize: 18 }}>
              Real-time monitoring and tracking
            </p>
          </div>
          <div
            style={{
              border: "1px solid rgba(148,163,184,0.2)",
              background: "rgba(15,23,42,0.82)",
              borderRadius: 16,
              padding: "14px 18px",
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                marginBottom: 6,
                fontWeight: 700,
              }}
            >
              Status
            </div>
            <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 15 }}>Operational</div>
          </div>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 18,
            marginBottom: 32,
          }}
        >
          {statCard("Total Conversations", `${sessionCount}`, "#60a5fa")}
          {statCard("Avg Response Time", formatDuration(avgResponseMs), "#34d399")}
          {statCard("AI Success Rate", `${successRate}%`, "#c084fc")}
          {statCard("Audit Source", rows.length > 0 ? "Live" : "No data", "#fb923c")}
        </section>

        <section
          style={{
            background: "rgba(15,23,42,0.7)",
            border: "1px solid rgba(148,163,184,0.16)",
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: "0 12px 36px rgba(2, 6, 23, 0.26)",
          }}
        >
          <div
            style={{
              padding: 24,
              borderBottom: "1px solid rgba(148,163,184,0.12)",
              background: "rgba(2,6,23,0.24)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Live Chat Tracking</h2>
            <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: 15 }}>
              Latest captured user queries and bot replies.
            </p>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr style={{ background: "rgba(15,23,42,0.92)" }}>
                  {["Time", "User", "Query", "Agent Response"].map((label) => (
                    <th
                      key={label}
                      style={{
                        textAlign: "left",
                        padding: "16px 18px",
                        color: "#94a3b8",
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: "0.03em",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length > 0 ? (
                  rows.slice(0, 20).map((row) => (
                    <tr key={row.id} style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}>
                      <td
                        style={{
                          padding: "16px 18px",
                          color: "#cbd5e1",
                          fontSize: 13,
                          whiteSpace: "nowrap",
                          verticalAlign: "top",
                        }}
                      >
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "16px 18px", verticalAlign: "top" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            borderRadius: 999,
                            background: "rgba(59,130,246,0.14)",
                            color: "#93c5fd",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {row.userId}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "16px 18px",
                          color: "#e2e8f0",
                          fontSize: 14,
                          lineHeight: 1.5,
                          maxWidth: 300,
                          verticalAlign: "top",
                        }}
                      >
                        {row.query}
                      </td>
                      <td
                        style={{
                          padding: "16px 18px",
                          color: "#94a3b8",
                          fontSize: 14,
                          lineHeight: 1.5,
                          maxWidth: 420,
                          verticalAlign: "top",
                        }}
                      >
                        {row.response}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: 32,
                        textAlign: "center",
                        color: "#94a3b8",
                        fontSize: 15,
                      }}
                    >
                      No live chat logs found yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
