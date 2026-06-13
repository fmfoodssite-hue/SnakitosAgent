import OpenAI from "openai";
import { assertServiceClient } from "@/lib/db";
import { env } from "@/lib/env";

type PlaygroundChunk = {
  id: string;
  sourceId: string;
  sourceName: string;
  text: string;
  similarityScore: number;
  rerankScore: number | null;
  matchReason: string;
  stale: boolean;
};

type PlaygroundInput = {
  query: string;
  model?: string;
  promptVersionId?: string | null;
  language?: string | null;
  saveTrace?: boolean;
};

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function normalizeLanguage(value: string | null | undefined) {
  const lowered = value?.toLowerCase();
  if (lowered === "urdu") return "Urdu";
  if (lowered === "roman urdu" || lowered === "roman_urdu") return "Roman Urdu";
  return "English";
}

function scoreChunk(query: string, content: string) {
  const queryTokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
  const haystack = content.toLowerCase();
  const matches = queryTokens.filter((token) => haystack.includes(token)).length;
  return queryTokens.length > 0 ? matches / queryTokens.length : 0;
}

async function fetchPrompt(promptVersionId?: string | null) {
  const supabase = assertServiceClient();

  if (promptVersionId) {
    const { data } = await supabase
      .from("prompt_versions")
      .select("*")
      .eq("id", promptVersionId)
      .maybeSingle();
    if (data) return data;
  }

  const { data } = await supabase
    .from("prompt_versions")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

async function retrieveChunks(query: string) {
  const supabase = assertServiceClient();
  const { data } = await supabase
    .from("knowledge_chunks")
    .select("id, document_id, content, metadata, updated_at, knowledge_documents(title,status)")
    .order("updated_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Array<{
    id: string;
    document_id: string;
    content: string;
    metadata?: Record<string, unknown> | null;
    updated_at?: string | null;
    knowledge_documents?: { title?: string | null; status?: string | null } | null;
  }>;

  const ranked = rows
    .map((row) => {
      const similarityScore = scoreChunk(query, row.content);
      return {
        id: row.id,
        sourceId: row.document_id,
        sourceName: row.knowledge_documents?.title ?? "Untitled source",
        text: row.content,
        similarityScore,
        rerankScore: similarityScore,
        matchReason: similarityScore > 0 ? "keyword_overlap" : "recent_chunk_fallback",
        stale: row.knowledge_documents?.status === "archived",
      } satisfies PlaygroundChunk;
    })
    .filter((row) => row.similarityScore > 0)
    .sort((left, right) => right.similarityScore - left.similarityScore)
    .slice(0, 6);

  return ranked;
}

async function buildAnswer(input: PlaygroundInput, promptText: string, chunks: PlaygroundChunk[]) {
  if (!env.OPENAI_API_KEY) {
    return {
      status: "not_configured" as const,
    };
  }

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = input.model || "gpt-4.1-mini";
  const context = chunks
    .map((chunk, index) => `Source ${index + 1}: ${chunk.sourceName}\n${chunk.text}`)
    .join("\n\n");
  const startedAt = Date.now();

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `${promptText}\n\nAnswer only from the provided knowledge. If the sources do not support the answer, say so clearly.`,
      },
      {
        role: "user",
        content: `Question: ${input.query}\n\nLanguage: ${normalizeLanguage(input.language)}\n\nSources:\n${context || "No sources found."}`,
      },
    ],
  });

  const generatedAnswer =
    completion.choices[0]?.message?.content?.trim() ||
    "I could not generate an answer from the approved knowledge.";
  const usage = completion.usage;
  const latencyMs = Date.now() - startedAt;
  const inputTokens = usage?.prompt_tokens ?? estimateTokens(`${promptText}\n${context}\n${input.query}`);
  const outputTokens = usage?.completion_tokens ?? estimateTokens(generatedAnswer);
  const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;
  const estimatedCost = Number((((inputTokens / 1_000_000) * 0.4) + ((outputTokens / 1_000_000) * 1.6)).toFixed(6));

  return {
    status: "ok" as const,
    model,
    generatedAnswer,
    latencyMs,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCost,
  };
}

export async function runPlaygroundQuery(input: PlaygroundInput) {
  const supabase = assertServiceClient();
  const prompt = await fetchPrompt(input.promptVersionId);
  const chunks = await retrieveChunks(input.query);
  const answer = await buildAnswer(
    input,
    prompt?.system_prompt ??
      "You are Snakitos AI. Answer only from approved Snakitos knowledge and do not guess.",
    chunks,
  );

  if (answer.status === "not_configured") {
    return answer;
  }

  const hadSource = chunks.length > 0;
  const avgSimilarity =
    chunks.length > 0
      ? chunks.reduce((sum, chunk) => sum + chunk.similarityScore, 0) / chunks.length
      : 0;
  const confidenceScore = Math.min(0.99, hadSource ? 0.45 + avgSimilarity * 0.5 : 0.15);
  const groundingScore = Math.min(0.99, hadSource ? avgSimilarity * 0.95 : 0.05);
  const hallucinationRisk = hadSource ? Math.max(0.01, 1 - groundingScore) : 0.95;
  const usedStaleSource = chunks.some((chunk) => chunk.stale);

  await supabase.from("rag_test_runs").insert({
    actual_answer: answer.generatedAnswer,
    retrieved_sources: chunks.map((chunk) => ({
      chunk_id: chunk.id,
      source_id: chunk.sourceId,
      source_name: chunk.sourceName,
      similarity_score: chunk.similarityScore,
      rerank_score: chunk.rerankScore,
      match_reason: chunk.matchReason,
    })),
    pass_fail: confidenceScore >= 0.7 ? "pass" : confidenceScore >= 0.45 ? "warning" : "fail",
    hallucination_risk:
      hallucinationRisk >= 0.66 ? "high" : hallucinationRisk >= 0.33 ? "medium" : "low",
    notes: input.query,
  });

  await supabase.from("audit_logs").insert({
    action: "playground.test",
    entity_type: "rag_test_run",
    details: {
      query: input.query,
      model: answer.model,
      total_tokens: answer.totalTokens,
      estimated_cost: answer.estimatedCost,
      chunk_count: chunks.length,
    },
  });

  return {
    status: "ok" as const,
    generated_answer: answer.generatedAnswer,
    retrieved_chunks: chunks.map((chunk) => ({
      id: chunk.id,
      source_id: chunk.sourceId,
      source_name: chunk.sourceName,
      text_preview: chunk.text.slice(0, 220),
      similarity_score: chunk.similarityScore,
      rerank_score: chunk.rerankScore,
      match_reason: chunk.matchReason,
    })),
    source_names: chunks.map((chunk) => chunk.sourceName),
    similarity_scores: chunks.map((chunk) => chunk.similarityScore),
    rerank_scores: chunks.map((chunk) => chunk.rerankScore),
    match_reasons: chunks.map((chunk) => chunk.matchReason),
    confidence_score: Number(confidenceScore.toFixed(4)),
    grounding_score: Number(groundingScore.toFixed(4)),
    hallucination_risk: Number(hallucinationRisk.toFixed(4)),
    had_source: hadSource,
    used_stale_source: usedStaleSource,
    model: answer.model,
    prompt_version: prompt
      ? {
          id: prompt.id,
          version_label: prompt.version_label,
        }
      : null,
    latency_ms: answer.latencyMs,
    input_tokens: answer.inputTokens,
    output_tokens: answer.outputTokens,
    total_tokens: answer.totalTokens,
    estimated_cost: answer.estimatedCost,
    language: normalizeLanguage(input.language),
  };
}
