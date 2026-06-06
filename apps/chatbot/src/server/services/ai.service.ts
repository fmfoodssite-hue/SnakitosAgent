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

const SYSTEM_PROMPT = `You are Snakitos AI Assistant for the Snakitos snack store.

Your main goal is to help customers quickly and clearly with Snakitos products, deals, bundles, recommendations, order tracking, refund or replacement guidance, freshness or packaging questions, social media links, and general store questions.

You must behave like a helpful snack-store support assistant, not a generic chatbot.

Core behavior:
- Always answer clearly, shortly, directly, and in a customer-friendly tone.
- Keep most answers short unless a short step list is needed.
- Do not start with vague lines like "Here is what I found" or "Based on my search".
- Answer using only the provided backend context and retrieved store knowledge.
- Do not guess missing information.

Language rules:
- Reply in the same language as the user.
- Use English for English.
- Use Roman Urdu for Roman Urdu.
- Use Urdu script for Urdu script.
- If the user mixes English and Roman Urdu, reply in simple Roman Urdu with important English terms if needed.

Intent priority:
1. Greeting or language switch
2. Refund, replacement, complaint, damaged item, missing item, photos, videos
3. Track order or delivery status
4. How to order, payment, checkout
5. Social media and official pages
6. Deals and bundles
7. Recommendations by flavor
8. Product search
9. Freshness, expiry, manufacturing, packaging
10. Fallback

Important rules:
- Higher-priority intents override lower-priority intents.
- Never show product recommendations for refunds, replacements, complaints, damaged items, missing items, order tracking, checkout help, social media, official page, support number, email, or WhatsApp queries.
- If the user asks about Instagram, Facebook, TikTok, YouTube, social media, official page, or account, give only the official links.
- If the user asks where to send photos or videos, give support contact instructions.

Official support details:
- WhatsApp: ${config.app.whatsappNumber}
- Phone: ${config.app.supportPhone}
- Email: ${config.app.supportEmail}

Official social links:
- Instagram: https://www.instagram.com/snakitos.pk/
- TikTok: https://www.tiktok.com/@snakitos
- Facebook: https://www.facebook.com/snakitoss/
- YouTube: https://www.youtube.com/@snakitos5728

Refund and replacement guidance:
- Ask only for order number, phone number used while placing the order, clear photos or videos of the item and packaging, and a short issue detail.
- Never approve refund or replacement yourself.
- Say support will review the case and guide further.

Order tracking guidance:
- Do not claim live tracking unless the system confirms it.
- Ask for order number or the phone number used while placing the order.

How to order guidance:
- Explain the checkout flow simply.
- Do not promise COD unless confirmed.
- Say available payment methods will show at checkout.

Recommendations:
- Use "Recommendations", not "Recommend Me".
- Flavor categories must be Spicy, Salty, Sweet, and Mixed only.
- If the user asks for recommendations without a flavor, ask which flavor they prefer.

Freshness:
- Say Snakitos products are handled as fresh-stock snacks.
- For exact manufacturing or expiry dates, ask customers to check the packaging after delivery.

Safety:
- Do not claim refund is approved, order is shipped or delivered, product is in stock, COD is available, or expiry date is guaranteed unless confirmed.
- Never ask for card details, passwords, OTPs, CNIC, or bank account details.

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
