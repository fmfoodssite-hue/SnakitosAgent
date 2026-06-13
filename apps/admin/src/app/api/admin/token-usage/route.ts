import { withAdminAccess } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const { searchParams } = new URL(request.url);
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10));
      const offset = (page - 1) * limit;
      const period = searchParams.get("period") ?? "30d";

      const supabase = assertServiceClient();
      const since = new Date();
      if (period === "7d") since.setDate(since.getDate() - 7);
      else if (period === "30d") since.setDate(since.getDate() - 30);
      else if (period === "90d") since.setDate(since.getDate() - 90);
      else since.setDate(since.getDate() - 30);

      const [totalsResult, logsResult] = await Promise.all([
        supabase
          .from("token_usage_logs")
          .select("model, input_tokens, output_tokens, embedding_tokens, total_tokens, estimated_cost, created_at")
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false }),
        supabase
          .from("token_usage_logs")
          .select("*", { count: "exact" })
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1),
      ]);

      if (totalsResult.error) throw totalsResult.error;

      const rows = totalsResult.data ?? [];
      const totalInputTokens = rows.reduce((s, r) => s + (r.input_tokens ?? 0), 0);
      const totalOutputTokens = rows.reduce((s, r) => s + (r.output_tokens ?? 0), 0);
      const totalEmbeddingTokens = rows.reduce((s, r) => s + (r.embedding_tokens ?? 0), 0);
      const totalTokens = rows.reduce((s, r) => s + (r.total_tokens ?? 0), 0);
      const totalCost = rows.reduce((s, r) => s + Number(r.estimated_cost ?? 0), 0);

      // Group by model
      const byModel: Record<string, { input: number; output: number; total: number; cost: number; calls: number }> = {};
      for (const row of rows) {
        const model = row.model ?? "unknown";
        if (!byModel[model]) byModel[model] = { input: 0, output: 0, total: 0, cost: 0, calls: 0 };
        byModel[model].input += row.input_tokens ?? 0;
        byModel[model].output += row.output_tokens ?? 0;
        byModel[model].total += row.total_tokens ?? 0;
        byModel[model].cost += Number(row.estimated_cost ?? 0);
        byModel[model].calls += 1;
      }

      // Group by day
      const byDay: Record<string, { tokens: number; cost: number }> = {};
      for (const row of rows) {
        const day = (row.created_at ?? "").slice(0, 10);
        if (!byDay[day]) byDay[day] = { tokens: 0, cost: 0 };
        byDay[day].tokens += row.total_tokens ?? 0;
        byDay[day].cost += Number(row.estimated_cost ?? 0);
      }

      return successResponse({
        summary: {
          total_input_tokens: totalInputTokens,
          total_output_tokens: totalOutputTokens,
          total_embedding_tokens: totalEmbeddingTokens,
          total_tokens: totalTokens,
          total_cost: Number(totalCost.toFixed(6)),
          period,
        },
        by_model: Object.entries(byModel).map(([model, stats]) => ({ model, ...stats })),
        by_day: Object.entries(byDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, stats]) => ({ date, ...stats })),
        logs: logsResult.data ?? [],
        total: logsResult.count ?? 0,
        page,
        limit,
      });
    } catch (error) {
      console.error("Token usage load failed", error);
      return errorResponse("TOKEN_USAGE_FAILED", "Unable to load token usage.", 500);
    }
  });
}
