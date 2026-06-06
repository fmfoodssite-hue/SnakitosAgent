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
  ] = await Promise.all([
    supabase.from("chat_messages").select("*", { count: "exact", head: true }),
    supabase.from("knowledge_documents").select("*", { count: "exact", head: true }),
    supabase.from("knowledge_chunks").select("*", { count: "exact", head: true }),
    supabase.from("uploaded_files").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("chat_messages").select("*", { count: "exact", head: true }).eq("is_failed_answer", true),
    supabase.from("handoff_tickets").select("*", { count: "exact", head: true }),
    supabase.from("chat_messages").select("*", { count: "exact", head: true }).ilike("detected_intent", "%order%"),
    supabase.from("prompt_versions").select("*", { count: "exact", head: true }),
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

  return {
    totalChats: chats.count ?? 0,
    totalKnowledgeDocuments: docs.count ?? 0,
    totalChunks: chunks.count ?? 0,
    lastRagSync: files.data?.updated_at ?? null,
    failedQuestions: failedQuestions.count ?? 0,
    humanHandoffs: handoffs.count ?? 0,
    orderTrackingRequests: orderTracking.count ?? 0,
    promptVersions: promptVersions.count ?? 0,
    mostAskedQuestions: (topQuestions ?? []).map((row) => row.user_message),
    mostRecommendedProducts: (topProducts ?? []).map((row) => row.title),
  };
}

export async function getDeepAnalytics() {
  const supabase = assertServiceClient();

  const [messages, handoffs, products] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("user_message, detected_intent, is_failed_answer, metadata, recommended_products, created_at"),
    supabase.from("handoff_tickets").select("complaint_type, status"),
    supabase.from("shopify_products").select("title, tags, collection"),
  ]);

  const messageRows = messages.data ?? [];
  const handoffRows = handoffs.data ?? [];
  const productRows = products.data ?? [];

  return {
    topQuestions: messageRows.slice(0, 10),
    topFailedQuestions: messageRows.filter((row) => row.is_failed_answer).slice(0, 10),
    topProductsRecommended: productRows.slice(0, 10),
    topComplaintTypes: handoffRows,
    languageUsage: messageRows.map((row) => (row.metadata as Record<string, unknown>)?.language).filter(Boolean),
    handoffRate: messageRows.length === 0 ? 0 : handoffRows.length / messageRows.length,
    ragSourceUsage: messageRows.map((row) => (row.metadata as Record<string, unknown>)?.retrieved_sources).filter(Boolean),
    unansweredQuestions: messageRows.filter((row) => row.is_failed_answer),
  };
}

