import { withAdminAccess } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, noDataResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function startOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

export async function GET() {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const supabase = assertServiceClient();
      const todayIso = startOfTodayIso();

      const [
        sessionsResult,
        messagesResult,
        productsResult,
        documentsResult,
        ticketsResult,
        openAlertsResult,
        // Real token usage from production table
        tokenUsageTodayResult,
        // Real ingestion queue
        ingestionQueueResult,
        // Answer traces for confidence/latency metrics
        tracesResult,
        // Crawler success rate
        crawledPagesResult,
      ] = await Promise.all([
        supabase.from("chat_sessions").select("id, handoff_status, updated_at, created_at"),
        supabase.from("chat_messages").select("id, retrieved_sources, is_failed_answer, metadata, created_at"),
        supabase.from("shopify_products").select("last_synced_at"),
        supabase.from("knowledge_documents").select("id, source_type, status"),
        supabase.from("handoff_tickets").select("id, status"),
        supabase.from("alerts").select("id", { count: "exact", head: true }).eq("status", "open"),
        // Real token & cost from token_usage_logs
        supabase
          .from("token_usage_logs")
          .select("total_tokens, estimated_cost")
          .gte("created_at", todayIso),
        // Ingestion queue — jobs that are queued or running
        supabase
          .from("ingestion_jobs")
          .select("id", { count: "exact", head: true })
          .in("status", ["queued", "running"]),
        // Answer traces for real latency & confidence data
        supabase
          .from("answer_traces")
          .select("confidence_score, hallucination_risk, latency_ms, retrieval_latency_ms, had_source")
          .order("created_at", { ascending: false })
          .limit(500),
        // Crawler pages
        supabase
          .from("crawled_pages")
          .select("status", { count: "exact" })
          .limit(1000),
      ]);

      const sessions = sessionsResult.data ?? [];
      const messages = messagesResult.data ?? [];
      const products = productsResult.data ?? [];
      const documents = documentsResult.data ?? [];
      const tickets = ticketsResult.data ?? [];
      const traceRows = tracesResult.data ?? [];
      const crawledRows = crawledPagesResult.data ?? [];

      // --- Chat stats ---
      const answers = messages.length;
      const sourcedAnswers = messages.filter((row) => asArray(row.retrieved_sources).length > 0).length;
      const failedAnswers = messages.filter((row) => row.is_failed_answer).length;
      const noSourceAnswers = answers - sourcedAnswers;

      const activeConversations = sessions.filter((row) => {
        const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        return updatedAt >= Date.now() - 24 * 60 * 60 * 1000;
      }).length;
      const escalatedConversations = sessions.filter(
        (row) => row.handoff_status && row.handoff_status !== "none",
      ).length;

      // --- Latency & confidence from answer_traces ---
      const hasTraces = traceRows.length > 0;

      const avgResponseLatency = hasTraces
        ? Math.round(
            traceRows.reduce((sum, row) => sum + (row.latency_ms ?? 0), 0) / traceRows.length,
          )
        : messages.length > 0
          ? Math.round(
              messages.reduce((sum, row) => {
                const metadata = asRecord(row.metadata);
                return sum + Number(metadata.responseTimeMs ?? 0);
              }, 0) / messages.length,
            )
          : 0;

      const avgRetrievalLatency = hasTraces
        ? Math.round(
            traceRows.reduce((sum, row) => sum + (row.retrieval_latency_ms ?? 0), 0) / traceRows.length,
          )
        : 0;

      const avgConfidence = hasTraces
        ? traceRows.reduce((sum, row) => sum + Number(row.confidence_score ?? 0), 0) / traceRows.length
        : null;

      const groundedAnswers = hasTraces
        ? traceRows.filter((row) => row.had_source && Number(row.confidence_score ?? 0) >= 0.7).length
        : messages.filter((row) => {
            const metadata = asRecord(row.metadata);
            return (
              asArray(row.retrieved_sources).length > 0 &&
              row.is_failed_answer !== true &&
              Number(metadata.confidence ?? metadata.confidenceScore ?? 0.8) >= 0.7
            );
          }).length;

      const lowConfidenceAnswers = hasTraces
        ? traceRows.filter((row) => {
            const conf = Number(row.confidence_score ?? 0);
            return conf > 0 && conf < 0.6;
          }).length
        : messages.filter((row) => {
            const metadata = asRecord(row.metadata);
            const confidence = Number(metadata.confidence ?? metadata.confidenceScore ?? 0);
            return confidence > 0 && confidence < 0.6;
          }).length;

      // --- Token usage from production table ---
      const tokenRows = tokenUsageTodayResult.data ?? [];
      const tokenUsageToday = tokenRows.reduce((sum, row) => sum + (row.total_tokens ?? 0), 0);
      const costToday = Number(
        tokenRows.reduce((sum, row) => sum + Number(row.estimated_cost ?? 0), 0).toFixed(4),
      );

      // --- Shopify ---
      const latestShopifySync = products
        .map((row) => row.last_synced_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

      // --- Crawler success rate ---
      const successPages = crawledRows.filter((r) => r.status === "success").length;
      const crawlerSuccessRate =
        crawledRows.length > 0 ? successPages / crawledRows.length : null;

      // --- FAQ deflection ---
      const activeFaqs = documents.filter(
        (row) => row.source_type === "faq" && row.status === "active",
      ).length;
      const faqDeflectionRate =
        sessions.length > 0 ? Math.min(1, activeFaqs / sessions.length) : 0;

      // --- Vector DB status from last health check ---
      const { data: lastVectorCheck } = await supabase
        .from("system_health_checks")
        .select("status")
        .eq("service_name", "vector_db")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const payload = {
        active_conversations: activeConversations,
        retrieval_hit_rate: answers > 0 ? sourcedAnswers / answers : 0,
        grounded_answer_rate: hasTraces
          ? groundedAnswers / traceRows.length
          : answers > 0 ? groundedAnswers / answers : 0,
        no_source_answer_rate: answers > 0 ? noSourceAnswers / answers : 0,
        low_confidence_answer_rate: hasTraces
          ? lowConfidenceAnswers / traceRows.length
          : answers > 0 ? lowConfidenceAnswers / answers : 0,
        failed_answer_rate: answers > 0 ? failedAnswers / answers : 0,
        human_handoff_rate: sessions.length > 0 ? escalatedConversations / sessions.length : 0,
        faq_deflection_rate: faqDeflectionRate,
        average_response_latency_ms: avgResponseLatency,
        average_retrieval_latency_ms: avgRetrievalLatency,
        average_confidence_score: avgConfidence,
        token_usage_today: tokenUsageToday,
        cost_today: costToday,
        shopify_sync_freshness: latestShopifySync,
        crawler_success_rate: crawlerSuccessRate,
        ingestion_queue_backlog: ingestionQueueResult.count ?? 0,
        vector_db_status: lastVectorCheck?.status ?? "unknown",
        open_alerts: openAlertsResult.count ?? 0,
        open_tickets: tickets.filter((row) => row.status !== "resolved").length,
      };

      const hasData =
        sessions.length > 0 || messages.length > 0 || products.length > 0 || documents.length > 0;
      return hasData ? successResponse(payload) : noDataResponse(payload);
    } catch (error) {
      console.error("Dashboard metrics failed", error);
      return errorResponse("DASHBOARD_LOAD_FAILED", "Unable to load dashboard metrics.", 500);
    }
  });
}
