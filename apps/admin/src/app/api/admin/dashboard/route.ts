import { withAdminAccess } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, noDataResponse, successResponse } from "@/lib/response";

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

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const supabase = assertServiceClient();
      const [
        sessionsResult,
        messagesResult,
        productsResult,
        documentsResult,
        auditLogsResult,
        ticketsResult,
      ] = await Promise.all([
        supabase.from("chat_sessions").select("id, handoff_status, updated_at, created_at"),
        supabase.from("chat_messages").select("id, retrieved_sources, is_failed_answer, metadata, created_at"),
        supabase.from("shopify_products").select("last_synced_at"),
        supabase.from("knowledge_documents").select("id, source_type, status"),
        supabase.from("audit_logs").select("id, created_at"),
        supabase.from("handoff_tickets").select("id, status"),
      ]);

      if (sessionsResult.error || messagesResult.error || productsResult.error || documentsResult.error || auditLogsResult.error || ticketsResult.error) {
        throw sessionsResult.error || messagesResult.error || productsResult.error || documentsResult.error || auditLogsResult.error || ticketsResult.error;
      }

      const sessions = sessionsResult.data ?? [];
      const messages = messagesResult.data ?? [];
      const products = productsResult.data ?? [];
      const documents = documentsResult.data ?? [];
      const tickets = ticketsResult.data ?? [];

      const answers = messages.length;
      const sourcedAnswers = messages.filter((row) => asArray(row.retrieved_sources).length > 0).length;
      const failedAnswers = messages.filter((row) => row.is_failed_answer).length;
      const lowConfidenceAnswers = messages.filter((row) => {
        const metadata = asRecord(row.metadata);
        const confidence = Number(metadata.confidence ?? metadata.confidenceScore ?? 0);
        return confidence > 0 && confidence < 0.6;
      }).length;
      const groundedAnswers = messages.filter((row) => {
        const metadata = asRecord(row.metadata);
        return asArray(row.retrieved_sources).length > 0 && row.is_failed_answer !== true && Number(metadata.confidence ?? metadata.confidenceScore ?? 0.8) >= 0.7;
      }).length;
      const noSourceAnswers = answers - sourcedAnswers;
      const activeConversations = sessions.filter((row) => {
        const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        return updatedAt >= Date.now() - 24 * 60 * 60 * 1000;
      }).length;
      const escalatedConversations = sessions.filter((row) => row.handoff_status && row.handoff_status !== "none").length;

      const todayMessages = messages.filter((row) => (row.created_at ?? "") >= startOfTodayIso());
      const tokenUsageToday = todayMessages.reduce((sum, row) => {
        const metadata = asRecord(row.metadata);
        return sum + Number(metadata.tokenUsage ?? metadata.tokensUsed ?? metadata.totalTokens ?? 0);
      }, 0);
      const costToday = Number(((tokenUsageToday / 1000) * 0.5).toFixed(2));
      const avgResponseLatency =
        answers > 0
          ? Math.round(
              messages.reduce((sum, row) => {
                const metadata = asRecord(row.metadata);
                return sum + Number(metadata.responseTimeMs ?? 0);
              }, 0) / answers,
            )
          : 0;
      const avgRetrievalLatency =
        answers > 0
          ? Math.round(
              messages.reduce((sum, row) => {
                const metadata = asRecord(row.metadata);
                return sum + Number(metadata.retrievalLatencyMs ?? 0);
              }, 0) / answers,
            )
          : 0;

      const latestShopifySync = products
        .map((row) => row.last_synced_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

      const payload = {
        active_conversations: activeConversations,
        retrieval_hit_rate: answers > 0 ? sourcedAnswers / answers : 0,
        grounded_answer_rate: answers > 0 ? groundedAnswers / answers : 0,
        no_source_answer_rate: answers > 0 ? noSourceAnswers / answers : 0,
        low_confidence_answer_rate: answers > 0 ? lowConfidenceAnswers / answers : 0,
        failed_answer_rate: answers > 0 ? failedAnswers / answers : 0,
        human_handoff_rate: sessions.length > 0 ? escalatedConversations / sessions.length : 0,
        faq_deflection_rate:
          sessions.length > 0
            ? Math.min(1, documents.filter((row) => row.source_type === "faq" && row.status === "active").length / sessions.length)
            : 0,
        average_response_latency_ms: avgResponseLatency,
        average_retrieval_latency_ms: avgRetrievalLatency,
        token_usage_today: tokenUsageToday,
        cost_today: costToday,
        shopify_sync_freshness: latestShopifySync,
        crawler_success_rate: null,
        ingestion_queue_backlog: documents.filter((row) => row.status === "draft").length,
        vector_db_status: "unknown",
        open_alerts: 0,
        open_tickets: tickets.filter((row) => row.status !== "resolved").length,
      };

      const hasData = sessions.length > 0 || messages.length > 0 || products.length > 0 || documents.length > 0;
      return hasData ? successResponse(payload) : noDataResponse(payload);
    } catch (error) {
      console.error("Dashboard metrics failed", error);
      return errorResponse("DASHBOARD_LOAD_FAILED", "Unable to load dashboard metrics.", 500);
    }
  });
}

