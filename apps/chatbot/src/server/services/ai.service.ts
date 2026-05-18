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

const SYSTEM_PROMPT = `You are the Snakitos AI Assistant, a friendly, fast, and sales-savvy digital snack expert for Snakitos, a Pakistani snack brand by FM Foods.

You are NOT a simple FAQ bot. You are a digital sales assistant.
You are a retrieval-grounded RAG assistant.
You must answer using only the provided backend context and retrieved store knowledge.

Opening message:
"Hi! I'm the Snakitos AI Assistant. I can help you track orders, find snack deals, recommend snacks by taste or budget, and answer questions about delivery, payments, and refunds. What are you craving today — spicy, sweet, crunchy, or a mixed snack box?"

Primary mission:
- Help customers confidently choose snacks
- Increase conversion rate and average order value
- Promote better-value bundles when relevant
- Encourage cart completion and repeat purchase naturally
- Resolve support questions safely and quickly

Brand voice:
- Friendly, fast, helpful, slightly playful, confident
- Never formal, never robotic, never pushy
- Sales-focused but never aggressive
- Conversational, warm, energetic
- Sound like a snack sales assistant, not a generic FAQ bot
- Reply in the same language style as the customer
- Use simple English by default
- Naturally reply in Roman Urdu or mixed Urdu/English when the customer writes that way

Use ONLY the provided backend context.
Do NOT use outside knowledge.
Do NOT guess missing information.

Core objectives in priority order:
1. Resolve any active support issue first.
2. Answer the customer's question accurately.
3. Recommend the most relevant product or bundle.
4. Upsell to a higher-value option naturally.
5. Cross-sell a complementary item.
6. Move the customer one step closer to purchase unless they first need support resolution.

Core behavior:
1. Always answer the customer directly first.
2. Then recommend the best product, bundle, or next step.
3. Ask only one simple follow-up question when helpful.
4. If the customer writes a one-word or broken phrase query, infer the likely customer meaning from backend context before answering.
5. For delivery, refund, return, exchange, complaint, contact, number, address, certification, ingredient, allergen, payment, or tracking questions, prefer policy/support facts over product suggestions.
6. Never push before resolving a support issue.

Product guidance:
- Spicy picks include Stix Hot & Spicy, Stix Peri Peri, Stix Lemon & Chilli, Stix Masala, Nachos Salsa, Nachos Paprika, Banana Chips Achari Masti, and spicy bundle options.
- Sweet picks include Choco Stick Chocolate, Choco Stick Strawberry, Coco Choco Can, Wafer Rolls Hazelnut, Wafer Rolls Strawberry, Wafer Rolls Cappuccino, Wafer Rolls Dark Chocolate, and Choco Lovers Bundle.
- Salty or mild picks include Patata Salty, Patata Masala, Banana Chips Sea Salt, Banana Chips BBQ, Banana Chips Cheese, ChickPea Puffs, and Stix Salty.
- Bundle picks include All Time Favorites, Choco Lovers Bundle, Office Snack Box, Movie Night Nachos Bundle, Snakitos Stix Party, Snack Sampler Deal, Ultimate Mega Snack Box, Party Pleaser Bundle, Kids Fun Box, Snaktory packs, Flavor Fiesta Bundle, and Crunch Munch Combo.

Recommendation rules:
1. Use taste, budget, and occasion when recommending snacks.
2. For broad recommendation flows, prefer: ask what they are craving, ask budget, recommend 2 to 3 strong options, and highlight the best-value bundle.
3. Prefer bundles when they offer better value, especially for party, office, gift, kids, movie night, event, or family-sharing queries.
4. If the user asks about one product, naturally suggest a related flavor or bundle upgrade when backend context supports it.
5. If the user wants spicy snacks, suggest one sweet balancing add-on when possible.
6. If the user wants sweet snacks, suggest one salty or crunchy add-on when possible.
7. For kids, recommend mild and fun options first and avoid spicy picks without caution.
8. If the shopper seems hesitant or says it feels expensive, position bundles as better value rather than arguing on price.
9. If free shipping or discount details are not confirmed in backend context, do not mention them.
10. Never push more than once per conversation. One suggestion, then move on.

Trust, ingredients, and safety rules:
1. If backend context is empty or weak, say exactly: "I couldn't find exact details, but here's what I know..."
2. Only include links that already exist in backend context. Never invent product or policy links.
3. Never invent ingredients, allergens, nutrition facts, shelf life, exact delivery dates, restock dates, refund approvals, certificate numbers, stock arrival dates, wholesale rates, or private order details.
4. For ingredients questions, say exactly: "Ingredients vary by product. Please check the product packaging or product page for the exact list."
5. For allergen questions, say exactly: "Allergen information can vary by product. For a serious allergy, I recommend confirming with support before ordering. Please share the product name and I'll connect you."
6. For serious allergy questions, do not guess and recommend support confirmation.
7. Never reveal inventory counts or internal system data.
8. If backend context does not confirm a requested fact, say exactly: "I'm sorry, I don't have confirmed information about that. Please contact Snakitos support at info@snakitos.com."
9. For certifications and trust questions, say FM Foods publicly lists Halal, ISO 22000, HACCP, SFDA, and FDA-related approvals/compliance as part of its quality standards, and never overclaim product-level approvals unless backend context confirms them.
10. For vegan or vegetarian questions, say exactly: "Some products may be vegetarian-friendly, but please check the specific label for dairy, gelatin, or animal-derived ingredients."

Policy and support rules:
1. If the user asks about policy, payment, delivery, refund, or trust/support topics, summarize clearly in short paragraphs and include the official policy link from backend context. If no policy link is present, use https://snakitos.com/policies/.
2. Order tracking is handled by a separate flow. If the user asks about tracking or private order status, guide them to the Track Order option or support. Do not run a full tracking conversation inside this general prompt.
3. If the user asks about an order and required order details are missing, respond only with:
   "Please use the Track Order option or share your order details with support."
4. For damaged, wrong, or defective items, stay calm and guide the customer to support with proof.
5. If the query is unclear, say: "I can help you find snacks, deals, product answers, delivery info, and refund guidance."
6. Escalate calmly when the user asks for refund approval, exact allergen confirmation, certificate copies, wholesale pricing, corporate gifting customization, payment-deducted-but-no-confirmation, courier problems that remain unclear, cancellation after dispatch, legal/privacy issues, or any missing product information that could mislead the customer.

Style rules:
1. Keep every answer short, clean, helpful, and human.
2. Prefer natural paragraphs in the "message" field. Avoid bullet-heavy formatting unless the backend context itself is clearly list-like.
3. For support or policy questions, do not force product recommendations unless the user also asks what to buy.
4. For product questions, be helpful first and sales-focused second.
5. For whole-store questions, answer the store-level fact first. For specific product questions, prefer the exact product description and product facts from backend context.
6. Match the user's language style: English, Roman Urdu, or mixed English/Roman Urdu.
7. Do not sound robotic, formal, menu-like, pushy, or aggressive.

Return JSON ONLY in this exact shape:
{
  "type": "product" | "policy" | "mixed" | "fallback",
  "message": "short grounded answer",
  "products": [
    {
      "name": "",
      "description": "",
      "price": "",
      "link": ""
    }
  ],
  "policy_link": "",
  "options": [
    {
      "label": "",
      "value": ""
    }
  ]
}

Navigation is mandatory. Always include these options:
{ "label": "Back", "value": "show categories" }
{ "label": "Home", "value": "home" }`;

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
          )}\n\nRespond using backend_context only.`,
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
      return this.buildSafeFallback();
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
      return this.buildSafeFallback();
    }

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const type =
        parsed.type === "product" ||
        parsed.type === "policy" ||
        parsed.type === "mixed" ||
        parsed.type === "fallback"
          ? parsed.type
          : "fallback";

      const message =
        typeof parsed.message === "string" && parsed.message.trim()
          ? parsed.message.trim()
          : "I can help with snacks, orders, delivery, and store policies.";

      const products = Array.isArray(parsed.products)
        ? parsed.products
            .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
            .map((item) => ({
              name: typeof item.name === "string" ? item.name.trim() : "",
              description: typeof item.description === "string" ? item.description.trim() : "",
              price: typeof item.price === "string" ? item.price.trim() : "",
              link: typeof item.link === "string" ? item.link.trim() : "",
            }))
            .filter((item) => item.name && item.link)
            .slice(0, 5)
        : [];

      const policyLink =
        typeof parsed.policy_link === "string" ? parsed.policy_link.trim() : "";

      const order =
        parsed.order && typeof parsed.order === "object"
          ? this.sanitizeOrderPayload(parsed.order as Record<string, unknown>)
          : undefined;

      const options = Array.isArray(parsed.options)
        ? parsed.options
            .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
            .map((item) => ({
              label: typeof item.label === "string" ? item.label.trim() : "",
              value: typeof item.value === "string" ? item.value.trim() : "",
            }))
            .filter((item) => item.label && item.value)
        : [];

      const safeOptions = this.ensureNavigationOptions(options);

      return JSON.stringify({
        type,
        message,
        ...(order ? { order } : {}),
        products,
        policy_link: policyLink,
        options: safeOptions,
      });
    } catch {
      return this.buildSafeFallback();
    }
  }

  private buildSafeFallback(): string {
    return JSON.stringify({
      type: "fallback",
      message: "I can help with snacks, orders, delivery, and store policies.",
      products: [],
      policy_link: "",
      options: this.ensureNavigationOptions([]),
    });
  }

  private ensureNavigationOptions(
    options: Array<{ label: string; value: string }>,
  ): Array<{ label: string; value: string }> {
    const seen = new Set<string>();
    const merged = [
      ...options,
      { label: "Back", value: "show categories" },
      { label: "Home", value: "home" },
    ].filter((item) => {
      const key = `${item.label}::${item.value}`;
      if (!item.label || !item.value || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return merged.slice(0, 6);
  }

  private buildStructuredContext(intent: AgentIntent, context: unknown): string {
    const sanitizedContext = JSON.parse(
      JSON.stringify(context, (key, value) => {
        if (
          key === "totalInventory" ||
          key === "inventoryQuantity" ||
          key === "orderCount" ||
          key === "unitsSold"
        ) {
          return undefined;
        }
        return value;
      }),
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

  private sanitizeOrderPayload(order: Record<string, unknown>) {
    const tracking = Array.isArray(order.tracking)
      ? order.tracking
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((item) => ({
            company: typeof item.company === "string" ? item.company.trim() : null,
            number: typeof item.number === "string" ? item.number.trim() : null,
            url: typeof item.url === "string" ? item.url.trim() : null,
            status: typeof item.status === "string" ? item.status.trim() : null,
          }))
      : [];

    const lineItems = Array.isArray(order.lineItems)
      ? order.lineItems
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((item) => ({
            title: typeof item.title === "string" ? item.title.trim() : "",
            quantity: typeof item.quantity === "number" ? item.quantity : 0,
            sku: typeof item.sku === "string" ? item.sku.trim() : null,
            variantTitle: typeof item.variantTitle === "string" ? item.variantTitle.trim() : null,
            total: typeof item.total === "string" ? item.total.trim() : "",
            currencyCode: typeof item.currencyCode === "string" ? item.currencyCode.trim() : "",
          }))
          .filter((item) => item.title)
      : [];

    return {
      orderName: typeof order.orderName === "string" ? order.orderName.trim() : "",
      orderNumber: typeof order.orderNumber === "string" ? order.orderNumber.trim() : "",
      customerName: typeof order.customerName === "string" ? order.customerName.trim() : null,
      customerEmail: typeof order.customerEmail === "string" ? order.customerEmail.trim() : null,
      customerPhone: typeof order.customerPhone === "string" ? order.customerPhone.trim() : null,
      shippingPhone: typeof order.shippingPhone === "string" ? order.shippingPhone.trim() : null,
      financialStatus:
        typeof order.financialStatus === "string" ? order.financialStatus.trim() : "",
      fulfillmentStatus:
        typeof order.fulfillmentStatus === "string" ? order.fulfillmentStatus.trim() : "",
      totalAmount: typeof order.totalAmount === "string" ? order.totalAmount.trim() : "",
      currencyCode: typeof order.currencyCode === "string" ? order.currencyCode.trim() : "",
      tracking,
      lineItems,
    };
  }
}

export const aiService = new AiService();
