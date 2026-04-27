import OpenAI from "openai";
import { config } from "../config";
import { AgentIntent, AiGenerationInput } from "../types/chat.types";

let clientInstance: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
  if (!config.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (!clientInstance) {
    clientInstance = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }

  return clientInstance;
}

export const openaiClient = new Proxy(
  {},
  {
    get(_target, property) {
      const client = getOpenAiClient();
      return Reflect.get(client, property);
    },
  },
) as OpenAI;

const SYSTEM_PROMPT = `You are an AI Customer Support and Sales Assistant for an ecommerce brand (Snakitos).

Your job is to:
1. Help users find the right products
2. Answer questions about products (price, ingredients, category, usage)
3. Answer policy-related questions (shipping, return, refund, delivery)
4. Provide accurate and helpful responses using ONLY the provided data
5. Recommend products when appropriate

---

### DATA SOURCES

You will receive structured JSON data in the backend context:
* products -> list of products
* policies -> company policies
* knowledge -> additional RAG content (optional)

You MUST use this data as your primary source of truth.

---

### RESPONSE RULES

1. If the query is about PRODUCTS:
   * Search products context
   * Return relevant products
   * Include name, price, and short description
   * Recommend 2-5 items max

2. If the query is about POLICIES:
   * Search policies context
   * Give a clear, short answer
   * ALWAYS include the official policy link

3. If the query is MIXED (product + policy):
   * Answer both parts clearly

4. If no data is found:
   * Say: "I couldn't find exact information, but here's what I suggest..."
   * Do NOT hallucinate

---

### OUTPUT FORMAT (STRICT)

Return JSON ONLY:
{
  "type": "product" | "policy" | "mixed" | "fallback",
  "message": "natural language answer",
  "products": [
    {
      "name": "",
      "price": "",
      "description": ""
    }
  ],
  "policy_link": ""
}

---

### BEHAVIOR

* Be friendly but get straight to the point.
* AVOID corporate fluff like "customer satisfaction is our priority" or "we are here to help".
* Be concise (STRICT 3-5 lines max).
* **ALWAYS use bullet points for policy details.** Every key rule (time limit, condition, contact) MUST be its own bullet.
* Use simple language.
* Suggest products when helpful.
* Never make up prices or policies.
* Prefer exact matches over guesses.
* NEVER reveal exact inventory quantities or stock counts.

Example Message Style for Policy:
• 14-day return window.
• Item must be unused and in original packaging.
• Contact info@snakitos.com to start a return.
• Shipping fees are non-refundable.

---

### IMPORTANT

* NEVER answer without checking JSON
* NEVER hallucinate missing data
* ALWAYS include policy_link for policy queries
* Keep responses structured and clean
`;

export class AiService {
  async generateResponse(input: AiGenerationInput): Promise<string> {
    const completion = await getOpenAiClient().chat.completions.create({
      model: config.app.openAiModel,
      temperature: 0.2,
      max_tokens: config.app.openAiMaxTokens,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\n\nHere is the real-time backend data for this request (JSON format):\n${this.buildStructuredContext(
            input.intent,
            input.context,
          )}\n\nYou must base your response entirely on this real-time data. Provide a helpful, natural language response to the user.`,
        },
        {
          role: "user",
          content: input.userMessage,
        },
      ],
    });

    const rawResponse =
      completion.choices[0]?.message?.content?.trim() ||
      "I could not generate a response right now.";

    return this.sanitizeCustomerResponse(rawResponse);
  }

  sanitizeCustomerResponse(response: string): string {
    const trimmed = response.trim();
    if (!trimmed) {
      return "I could not generate a response right now.";
    }

    const sensitivePatterns = [
      /api[_\s-]?key/gi,
      /access[_\s-]?token/gi,
      /\btoken\b/gi,
      /\bsecret\b/gi,
      /\bpassword\b/gi,
      /system prompt/gi,
      /hidden instructions?/gi,
      /chain[-\s]?of[-\s]?thought/gi,
      /backend_context/gi,
      /environment variables?/gi,
      /\bprocess\.env\b/gi,
      /\bSHOPIFY_[A-Z0-9_]+\b/g,
      /\bOPENAI_[A-Z0-9_]+\b/g,
      /\bSUPABASE_[A-Z0-9_]+\b/g,
      /\bPINECONE_[A-Z0-9_]+\b/g,
      /sk-[A-Za-z0-9_-]+/g,
      /shpat_[A-Za-z0-9_-]+/g,
      /shpss_[A-Za-z0-9_-]+/g,
    ];

    if (sensitivePatterns.some((pattern) => pattern.test(trimmed))) {
      return JSON.stringify({
        type: "fallback",
        message: "I can help with Snakitos store, product, and order support, but I can’t share internal system or security details.",
        products: [],
        policy_link: ""
      });
    }

    return trimmed;
  }

  private buildStructuredContext(intent: AgentIntent, context: unknown): string {
    const sanitizedContext = JSON.parse(
      JSON.stringify(context, (key, value) => {
        if (key === "totalInventory" || key === "inventoryQuantity") {
          return undefined;
        }
        return value;
      })
    );

    return JSON.stringify(
      {
        intent,
        backend_context: sanitizedContext,
        instructions: "Respond using backend_context only.",
      },
      null,
      2,
    );
  }
}

export const aiService = new AiService();
