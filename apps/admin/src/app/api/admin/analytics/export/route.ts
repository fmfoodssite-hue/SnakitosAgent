import { NextResponse } from "next/server";
import { getAnalyticsSnapshot } from "@/lib/admin/data";

export async function GET() {
  const analytics = await getAnalyticsSnapshot();

  const rows = [
    ["metric", "value"],
    ["total_users", analytics.behavior.totalUsers],
    ["returning_users", analytics.behavior.returningUsers],
    ["avg_session_duration_sec", analytics.behavior.averageSessionDurationSec],
    ["queries_per_session", analytics.behavior.queriesPerSession],
    ["success_rate", analytics.ai.successRate],
    ["failure_rate", analytics.ai.failureRate],
    ["avg_response_time_ms", analytics.ai.averageResponseTimeMs],
    ["product_clicks", analytics.conversion.productClicks],
    ["add_to_cart", analytics.conversion.addToCart],
    ["orders_initiated", analytics.conversion.ordersInitiated],
  ];

  const csv = rows.map((row) => row.join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="chatbot-analytics.csv"',
    },
  });
}
