import { assertServiceClient } from "@/lib/db";

export async function getOverviewAnalytics() {
  const supabase = assertServiceClient();

  const [
    chats,
    docs,
    chunks,
    files,
    failedQuestions,
    handoffs,
    orderTracking,
    promptVersions,
    tokenUsage,
    answerTraces,
  ] = await Promise.all([
    supabase.from("chat_messages").select("*", { count: "exact", head: true }),
    supabase.from("knowledge_documents").select("*", { count: "exact", head: true }),
    supabase.from("knowledge_chunks").select("*", { count: "exact", head: true }),
    supabase.from("uploaded_files").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("chat_messages").select("*", { count: "exact", head: true }).eq("is_failed_answer", true),
    supabase.from("handoff_tickets").select("*", { count: "exact", head: true }),
    supabase.from("chat_messages").select("*", { count: "exact", head: true }).ilike("detected_intent", "%order%"),
    supabase.from("prompt_versions").select("*", { count: "exact", head: true }),
    // New production tables
    supabase.from("token_usage_logs").select("estimated_cost, total_tokens").order("created_at", { ascending: false }).limit(1000),
    supabase.from("answer_traces").select("confidence_score, had_source").order("created_at", { ascending: false }).limit(500),
  ]);

  const { data: topQuestions } = await supabase
    .from("chat_messages")
    .select("user_message")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: topProducts } = await supabase
    .from("shopify_products")
    .select("title, collection, last_synced_at")
    .order("last_synced_at", { ascending: false })
    .limit(5);

  // Aggregate token usage from production table
  const usageRows = tokenUsage.data ?? [];
  const totalTokensUsed = usageRows.reduce((s, r) => s + (r.total_tokens ?? 0), 0);
  const totalEstimatedCost = usageRows.reduce((s, r) => s + Number(r.estimated_cost ?? 0), 0);

  // Compute avg confidence from answer_traces
  const traceRows = answerTraces.data ?? [];
  const avgConfidence =
    traceRows.length > 0
      ? traceRows.reduce((s, r) => s + Number(r.confidence_score ?? 0), 0) / traceRows.length
      : null;

  const sourcedAnswerRate =
    traceRows.length > 0
      ? traceRows.filter((r) => r.had_source).length / traceRows.length
      : null;

  return {
    totalChats: chats.count ?? 0,
    totalKnowledgeDocuments: docs.count ?? 0,
    totalChunks: chunks.count ?? 0,
    lastRagSync: files.data?.updated_at ?? null,
    failedQuestions: failedQuestions.count ?? 0,
    humanHandoffs: handoffs.count ?? 0,
    orderTrackingRequests: orderTracking.count ?? 0,
    promptVersions: promptVersions.count ?? 0,
    mostAskedQuestions: (topQuestions ?? []).map((row) => row.user_message).filter(Boolean),
    mostRecommendedProducts: (topProducts ?? []).map((row) => row.title).filter(Boolean),
    // Production telemetry
    totalTokensUsed,
    totalEstimatedCostUsd: Number(totalEstimatedCost.toFixed(4)),
    avgConfidenceScore: avgConfidence !== null ? Number(avgConfidence.toFixed(4)) : null,
    sourcedAnswerRate: sourcedAnswerRate !== null ? Number(sourcedAnswerRate.toFixed(4)) : null,
  };
}

export async function getDeepAnalytics() {
  const supabase = assertServiceClient();

  const [messages, handoffs, products, tokenLogs, traces] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("user_message, detected_intent, is_failed_answer, metadata, created_at"),
    supabase.from("handoff_tickets").select("complaint_type, status"),
    supabase.from("shopify_products").select("title, tags, collection"),
    supabase
      .from("token_usage_logs")
      .select("model, total_tokens, estimated_cost, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("answer_traces")
      .select("confidence_score, hallucination_risk, had_source, retrieval_confidence, model, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const messageRows = messages.data ?? [];
  const handoffRows = handoffs.data ?? [];
  const productRows = products.data ?? [];
  const tokenRows = tokenLogs.data ?? [];
  const traceRows = traces.data ?? [];

  // Token aggregation by model
  const tokensByModel: Record<string, { tokens: number; cost: number; calls: number }> = {};
  for (const row of tokenRows) {
    const model = row.model ?? "unknown";
    if (!tokensByModel[model]) tokensByModel[model] = { tokens: 0, cost: 0, calls: 0 };
    tokensByModel[model].tokens += row.total_tokens ?? 0;
    tokensByModel[model].cost += Number(row.estimated_cost ?? 0);
    tokensByModel[model].calls += 1;
  }

  // Confidence distribution
  const highConfidence = traceRows.filter((r) => Number(r.confidence_score) >= 0.7).length;
  const midConfidence = traceRows.filter((r) => Number(r.confidence_score) >= 0.45 && Number(r.confidence_score) < 0.7).length;
  const lowConfidence = traceRows.filter((r) => Number(r.confidence_score) < 0.45).length;

  // Hallucination risk distribution
  const highRisk = traceRows.filter((r) => Number(r.hallucination_risk) >= 0.66).length;
  const medRisk = traceRows.filter((r) => Number(r.hallucination_risk) >= 0.33 && Number(r.hallucination_risk) < 0.66).length;
  const lowRisk = traceRows.filter((r) => Number(r.hallucination_risk) < 0.33).length;

  return {
    topQuestions: messageRows.slice(0, 10),
    topFailedQuestions: messageRows.filter((row) => row.is_failed_answer).slice(0, 10),
    topProductsRecommended: productRows.slice(0, 10),
    topComplaintTypes: handoffRows,
    languageUsage: messageRows
      .map((row) => (row.metadata as Record<string, unknown>)?.language)
      .filter(Boolean),
    handoffRate:
      messageRows.length === 0 ? 0 : handoffRows.length / messageRows.length,
    ragSourceUsage: messageRows
      .map((row) => (row.metadata as Record<string, unknown>)?.retrieved_sources)
      .filter(Boolean),
    unansweredQuestions: messageRows.filter((row) => row.is_failed_answer),
    // New production analytics
    tokensByModel: Object.entries(tokensByModel).map(([model, stats]) => ({
      model,
      ...stats,
      cost: Number(stats.cost.toFixed(6)),
    })),
    confidenceDistribution: {
      high: highConfidence,
      medium: midConfidence,
      low: lowConfidence,
      total: traceRows.length,
    },
    hallucinationRiskDistribution: {
      high: highRisk,
      medium: medRisk,
      low: lowRisk,
      total: traceRows.length,
    },
    sourcedAnswerPct:
      traceRows.length > 0
        ? Math.round((traceRows.filter((r) => r.had_source).length / traceRows.length) * 100)
        : 0,
  };
}
