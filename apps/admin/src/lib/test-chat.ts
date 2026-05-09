import OpenAI from "openai";
import { env } from "@/lib/env";
import { retrieveKnowledge } from "../../../../lib/pinecone";

export async function runAdminChatTest(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return { context: [], answer: "Please enter a question to test.", confidence: 0 };
  }

  if (!env.openAiApiKey || !env.pineconeApiKey || !env.pineconeIndexName) {
    return {
      context: [
        {
          id: "mock-1",
          name: "Fallback knowledge",
          text: "Environment variables are missing, so this test chat is running in preview mode.",
          link: "",
          type: "knowledge",
          category: "system",
        },
      ],
      answer:
        "Preview mode is active. Add OpenAI and Pinecone credentials to run the full RAG pipeline from the admin dashboard.",
      confidence: 0.36,
    };
  }

  const context = await retrieveKnowledge({
    query: trimmed,
    topK: 4,
    runtimeConfig: {
      openAiApiKey: env.openAiApiKey,
      pineconeApiKey: env.pineconeApiKey,
      pineconeIndexName: env.pineconeIndexName,
      pineconeNamespace: env.pineconeNamespace,
      storefrontDomain: env.shopifyDomain,
    },
  });

  const client = new OpenAI({ apiKey: env.openAiApiKey });
  const completion = await client.chat.completions.create({
    model: env.openAiModel,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are an internal admin QA assistant. Answer using only the retrieved context and keep the answer concise.",
      },
      {
        role: "user",
        content: `Question: ${trimmed}\n\nContext:\n${context
          .map((item) => `- ${item.name}: ${item.text}`)
          .join("\n")}`,
      },
    ],
  });

  const answer = completion.choices[0]?.message?.content?.trim() ?? "No answer generated.";
  const confidence = Number(
    Math.min(
      0.99,
      Math.max(
        0.15,
        context.reduce((sum, item) => sum + (item.score ?? 0.75), 0) / Math.max(context.length, 1),
      ),
    ).toFixed(2),
  );

  return { context, answer, confidence };
}
