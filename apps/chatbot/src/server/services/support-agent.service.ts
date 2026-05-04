import policyData from "../data/policies.json";
import {
  AgentContext,
  AgentIntent,
  ChatRequestInput,
  ChatResponsePayload,
} from "../types/chat.types";
import { ProductLookupResult } from "../types/order.types";
import { detectIntent } from "../utils/intent.util";
import {
  clearOrderVerificationFailures,
  getOrderVerificationBlockState,
  recordOrderVerificationFailure,
} from "../utils/security.util";
import {
  extractProductQuery,
  extractSelectionIndex,
  formatWhatsAppFallback,
  normalizePhone,
} from "../utils/validation.util";
import { aiService } from "./ai.service";
import { knowledgeService } from "./knowledge.service";
import { shopifyService } from "./shopify.service";
import { supabaseService } from "./supabase.service";

type PolicySection = {
  title: string;
  content: string;
};

type PolicyDocument = {
  policy_name: string;
  source: string;
  sections: PolicySection[];
};

export class SupportAgentService {
  async handleChat(input: ChatRequestInput): Promise<ChatResponsePayload> {
    const userId = await supabaseService.upsertUser({
      id: input.userId,
      email: input.email,
      phone: normalizePhone(input.phone),
    });
    const chatId = await supabaseService.getOrCreateChat(userId, input.chatId);

    await supabaseService.addMessage(chatId, "user", input.message);

    try {
      if (this.isSensitiveRequest(input.message)) {
        const response =
          "I can help with products, orders, shipping, and store policies, but I can't provide internal system or security information.";
        await supabaseService.addMessage(chatId, "bot", response);

        return {
          response,
          intent: "general",
          chatId,
          userId,
        };
      }

      const recentMessages = await supabaseService.getRecentMessages(chatId);
      const userRecentMessages = await supabaseService.getRecentMessagesForUser(userId);
      const intentResult = this.resolveIntentWithConversationContext(
        input.message,
        input.phone,
        [...userRecentMessages, ...recentMessages],
      );
      const response = await this.routeIntent(
        intentResult.intent,
        intentResult,
        input.message,
        chatId,
        input.clientKey,
      );
      const safeResponse = aiService.sanitizeCustomerResponse(response.response);

      await supabaseService.addMessage(chatId, "bot", safeResponse);
      await supabaseService.logEvent("chat_processed", {
        chatId,
        userId,
        intent: response.intent,
      });

      return {
        ...response,
        response: safeResponse,
        chatId,
        userId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown chat error";
      await supabaseService.logEvent("chat_error", {
        chatId,
        userId,
        error: errorMessage,
      });

      const response = formatWhatsAppFallback(
        "We are having trouble processing your request right now.",
      );

      await supabaseService.addMessage(chatId, "bot", response);
      return {
        response,
        intent: "general",
        chatId,
        userId,
      };
    }
  }

  private async routeIntent(
    intent: AgentIntent,
    intentResult: ReturnType<typeof detectIntent>,
    userMessage: string,
    chatId: string,
    clientKey?: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    if (this.isGreetingOrSmallTalk(userMessage)) {
      return {
        intent: "general",
        response: this.buildGreetingResponse(),
      };
    }

    if (intent === "order") {
      return this.handleOrderIntent(intentResult, userMessage, clientKey);
    }

    if (this.isPolicyQuestion(userMessage)) {
      return this.handlePolicyIntent(userMessage);
    }

    if (intent === "product") {
      return this.handleProductIntent(userMessage, chatId);
    }

    return this.handleGeneralIntent(userMessage, chatId);
  }

  private isSensitiveRequest(message: string): boolean {
    return /(api key|access token|secret key|client secret|password|prompt|system prompt|hidden instruction|ignore previous instructions|developer message|env file|environment variable|process\.env|shopify_admin_api_access_token|openai_api_key|supabase_service_role_key|pinecone_api_key|private key|bearer token|authorization header|session token|cookie dump|show me your rules|reveal instructions|print config|leak)/i.test(
      message,
    );
  }

  private resolveIntentWithConversationContext(
    message: string,
    phone: string | undefined,
    recentMessages: Array<{ role: "user" | "bot"; content: string }>,
  ): ReturnType<typeof detectIntent> {
    const current = detectIntent(message, phone);
    if (current.intent !== "order") {
      return current;
    }

    if (current.orderId && current.phone) {
      return current;
    }

    const recentUserMessages = recentMessages
      .filter((item) => item.role === "user")
      .map((item) => item.content)
      .reverse();
    const previousOrderContext = recentUserMessages.reduce(
      (acc, content) => {
        const detected = detectIntent(content);

        if (!acc.orderId && detected.orderId) {
          acc.orderId = detected.orderId;
        }

        if (!acc.phone && detected.phone) {
          acc.phone = detected.phone;
        }

        return acc;
      },
      {
        orderId: "",
        phone: "",
      },
    );

    return {
      intent: "order",
      orderId: current.orderId || previousOrderContext.orderId,
      phone: current.phone || previousOrderContext.phone,
    };
  }

  private async handleOrderIntent(
    intentResult: ReturnType<typeof detectIntent>,
    userMessage: string,
    clientKey?: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    if (!intentResult.orderId || !intentResult.phone) {
      return {
        intent: "order",
        response: JSON.stringify({
          type: "fallback",
          message:
            "I can check your order for you.\n\nPlease share your order number and the phone number used at checkout.",
          products: [],
          policy_link: "",
          options: [
            { label: "Back", value: "show categories" },
            { label: "Home", value: "home" },
          ],
        }),
      };
    }

    const blockState = getOrderVerificationBlockState(clientKey ?? "");
    if (blockState.blocked) {
      return {
        intent: "order",
        response: JSON.stringify({
          type: "fallback",
          message: `I couldn't verify the order after several attempts.\n\nPlease wait about ${Math.ceil(blockState.retryAfterSeconds / 60)} minutes and try again, or contact support if you still need help.`,
          products: [],
          policy_link: "",
          options: [
            { label: "Back", value: "show categories" },
            { label: "Home", value: "home" },
          ],
        }),
      };
    }

    let order;
    try {
      order = await shopifyService.getVerifiedOrder(intentResult.orderId, intentResult.phone);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Order lookup failed";
      await supabaseService.logEvent("order_lookup_error", {
        orderId: intentResult.orderId,
        error: errorMessage,
      });

      return {
        intent: "order",
        response: formatWhatsAppFallback("I could not access the order system right now."),
      };
    }

    if (!order) {
      const failureState = recordOrderVerificationFailure(clientKey ?? "");
      await supabaseService.logEvent("order_verification_failed", {
        orderId: intentResult.orderId,
        remainingAttempts: failureState.remainingAttempts,
        blocked: failureState.blocked,
      });

      return {
        intent: "order",
        response: failureState.blocked
          ? JSON.stringify({
              type: "fallback",
              message:
                "I couldn't verify the order after several attempts.\n\nPlease wait 15 minutes and try again, or contact support if you still need help.",
              products: [],
              policy_link: "",
              options: [
                { label: "Back", value: "show categories" },
                { label: "Home", value: "home" },
              ],
            })
          : formatWhatsAppFallback(
              "I couldn't match that order with the phone number provided.\n\nPlease double-check both details and try again.",
            ),
      };
    }

    clearOrderVerificationFailures(clientKey ?? "");

    const context: AgentContext = {
      order: {
        orderName: order.orderName,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        shippingPhone: order.shippingPhone,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        createdAt: order.createdAt,
        totalAmount: order.totalAmount,
        currencyCode: order.currencyCode,
        tracking: order.tracking,
        lineItems: order.lineItems,
      },
    };

    return {
      intent: "order",
      response: this.buildOrderResponse(context.order ?? order),
      data: order,
    };
  }

  private async handleProductIntent(
    userMessage: string,
    chatId: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    const recentMessages = await supabaseService.getRecentMessages(chatId);
    const productQuery = extractProductQuery(userMessage);
    const referencedProduct = this.resolveReferencedProductFromConversation(
      userMessage,
      recentMessages,
    );

    const isStoreBrowsingQuestion = /(best|selling|seller|popular|featured|deal|deals|bundle|combo|movie|night|craving|hungry|munch|tea|evening|midnight|party|snack|snacks|store|catalog|gift|gifts|relative|recommend|suggest|sweet|salty|spicy|crispy|crunchy|cheesy|wafer|banana|choco|chocolate)/i.test(
      userMessage,
    );

    let products: ProductLookupResult[] = [];
    try {
      if (referencedProduct) {
        products = await shopifyService.searchProducts(referencedProduct);
      } else if (productQuery) {
        products = await shopifyService.searchProducts(productQuery);
      }

      if (
        (products.length === 0 && isStoreBrowsingQuestion) ||
        (!productQuery && !referencedProduct)
      ) {
        products = await shopifyService.getStorefrontRecommendations(
          referencedProduct || productQuery || userMessage,
          50,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Product lookup failed";
      await supabaseService.logEvent("product_lookup_error", {
        query: referencedProduct || productQuery || userMessage,
        chatId,
        error: errorMessage,
      });

      const fallbackProducts = await this.getFallbackProductRecommendations(
        referencedProduct || productQuery || userMessage,
      );
      if (fallbackProducts.length > 0) {
        const curatedProducts = this.selectProductsForResponse(fallbackProducts, userMessage);
        const response = await aiService.generateResponse({
          intent: "product",
          userMessage,
          context: { products: curatedProducts },
        });
        return {
          intent: "product",
          response,
          data: fallbackProducts,
        };
      }

      return {
        intent: "product",
        response: formatWhatsAppFallback("I could not access the product catalog right now."),
      };
    }

    if (products.length === 0) {
      const fallbackProducts = await this.getFallbackProductRecommendations(
        referencedProduct || productQuery || userMessage,
      );
      if (fallbackProducts.length > 0) {
        const curatedProducts = this.selectProductsForResponse(fallbackProducts, userMessage);
        const response = await aiService.generateResponse({
          intent: "product",
          userMessage,
          context: { products: curatedProducts },
        });
        return {
          intent: "product",
          response,
          data: fallbackProducts,
        };
      }

      await supabaseService.logEvent("product_not_found", {
        query: productQuery,
        chatId,
      });

      return {
        intent: "product",
        response: formatWhatsAppFallback(
          productQuery
            ? `I could not find a product matching "${productQuery}".`
            : "I could not find matching products in the store right now.",
        ),
      };
    }

    const curatedProducts = this.selectProductsForResponse(products, userMessage);
    const response = await aiService.generateResponse({
      intent: "product",
      userMessage,
      context: { products: curatedProducts },
    });

    return {
      intent: "product",
      response,
      data: products,
    };
  }

  private async getFallbackProductRecommendations(query: string): Promise<ProductLookupResult[]> {
    try {
      return await shopifyService.getStorefrontRecommendations(query, 50);
    } catch {
      return [];
    }
  }

  private resolveReferencedProductFromConversation(
    userMessage: string,
    recentMessages: Array<{ role: "user" | "bot"; content: string }>,
  ): string {
    const directQuery = extractProductQuery(userMessage);
    const numberedChoice = extractSelectionIndex(userMessage);
    const recentBotMessages = recentMessages
      .filter((item) => item.role === "bot")
      .map((item) => item.content)
      .reverse();

    const numberedProducts = recentBotMessages.flatMap((content) =>
      [...content.matchAll(/\d+\.\s+(.+?)\s+-\s+(?:PKR|Price)/gi)].map((match) => match[1].trim()),
    );

    if (numberedChoice && numberedProducts[numberedChoice - 1]) {
      return numberedProducts[numberedChoice - 1];
    }

    const mentionedProduct = numberedProducts.find((title) =>
      userMessage.toLowerCase().includes(title.toLowerCase()),
    );

    if (mentionedProduct) {
      return mentionedProduct;
    }

    return directQuery;
  }

  private async handlePolicyIntent(
    userMessage: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    const policyDocument = this.resolvePolicyDocument(userMessage);

    if (!policyDocument) {
      return {
        intent: "general",
        response: JSON.stringify({
          type: "policy",
          message: "Please contact support.",
          products: [],
          policy_link: "https://snakitos.com/policies/",
          options: [
            { label: "Back", value: "show categories" },
            { label: "Home", value: "home" },
          ],
        }),
        data: [],
      };
    }

    const response = await aiService.generateResponse({
      intent: "general",
      userMessage,
      context: {
        knowledge: this.buildPolicyKnowledge(policyDocument, userMessage),
      },
    });

    return {
      intent: "general",
      response,
      data: policyDocument,
    };
  }

  private async handleGeneralIntent(
    userMessage: string,
    chatId: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    if (this.isUnclearQuery(userMessage)) {
      return {
        intent: "general",
        response: JSON.stringify({
          type: "fallback",
          message: "I can help with products, orders, or policies.",
          products: [],
          policy_link: "",
          options: [
            { label: "Deals", value: "show best deals" },
            { label: "Track Order", value: "track my order" },
            { label: "Policies", value: "show shipping and refund policy" },
            { label: "Home", value: "home" },
          ],
        }),
      };
    }

    const knowledge = await knowledgeService.retrieve(userMessage);

    const relevantKnowledge = knowledge.filter(
      (item) => !this.isPolicyQuestion(userMessage) || item.type === "policy",
    );

    if (relevantKnowledge.length === 0) {
      return {
        intent: "general",
        response: JSON.stringify({
          type: "fallback",
          message: "I couldn't find exact details, but here's what I know...",
          products: [],
          policy_link: "",
          options: [
            { label: "Deals", value: "show best deals" },
            { label: "Policies", value: "show shipping and refund policy" },
            { label: "Home", value: "home" },
          ],
        }),
        data: [],
      };
    }

    const recentMessages = await supabaseService.getRecentMessages(chatId);
    const response = await aiService.generateResponse({
      intent: "general",
      userMessage,
      context: {
        knowledge: relevantKnowledge,
        recentMessages,
      },
    });

    return {
      intent: "general",
      response,
      data: relevantKnowledge,
    };
  }

  private isGreetingOrSmallTalk(message: string): boolean {
    return /^(hi|hello|hey|assalamualaikum|salam|yo|start|menu|show categories|collections)\b/i.test(
      message.trim(),
    );
  }

  private isUnclearQuery(message: string): boolean {
    return /^(hi|hello|hey|ok|okay|hmm|hmmm|thanks|thank you|start|menu|show categories|collections)\b/i.test(
      message.trim(),
    );
  }

  private isPolicyQuestion(message: string): boolean {
    return /(policy|policies|privacy|terms|service|return|refund|shipping|delivery|exchange|cancel|cancellation|payment|cookie|cookies|share|sharing|third party|third parties|personal data|personal information|what data|collect|collection|tracking|charges|refund window|damaged|defective)/i.test(
      message,
    );
  }

  private buildGreetingResponse(): string {
    return JSON.stringify({
      type: "fallback",
      message: "I can help with products, orders, or policies.",
      products: [],
      policy_link: "",
      options: [
        { label: "Deals", value: "show best deals" },
        { label: "Sweet Tooth", value: "Show me Sweet Tooth snacks" },
        { label: "Multi Grain", value: "Show me Multi Grain snacks" },
        { label: "Banana Chips", value: "Show me Banana Chips" },
        { label: "Track Order", value: "track my order" },
        { label: "Policies", value: "show shipping and refund policy" },
        { label: "Home", value: "home" },
      ],
    });
  }

  private selectRelevantPolicySections(
    policy: PolicyDocument,
    userMessage: string,
  ): PolicySection[] {
    const normalized = userMessage.toLowerCase();

    if (policy.policy_name === "Privacy Policy") {
      if (/share|sharing|third party|third parties|processor|logistics/.test(normalized)) {
        return policy.sections.filter((section) => /data sharing/i.test(section.title));
      }

      if (/rights|delete|deletion|access|update|correction/.test(normalized)) {
        return policy.sections.filter((section) => /user rights/i.test(section.title));
      }

      if (/cookie|tracking|browser/.test(normalized)) {
        return policy.sections.filter((section) => /cookies|tracking/i.test(section.title));
      }

      if (/use|used|purpose|process orders|personalize|updates|offers/.test(normalized)) {
        return policy.sections.filter((section) => /use of information/i.test(section.title));
      }

      if (/collect|collection|data|personal|information/.test(normalized)) {
        return policy.sections.filter((section) => /information collection/i.test(section.title));
      }

      return policy.sections.filter((section) =>
        /information collection|use of information|cookies|data sharing|user rights/i.test(
          section.title,
        ),
      );
    }

    if (policy.policy_name === "Shipping Policy") {
      if (/process|processing|confirmation|payment verification|availability/.test(normalized)) {
        return policy.sections.filter((section) => /order processing/i.test(section.title));
      }

      if (/delivery|time|days|delay|location/.test(normalized)) {
        return policy.sections.filter((section) => /delivery time/i.test(section.title));
      }

      if (/shipping charges|shipping cost|charges|fees|checkout|promotion/.test(normalized)) {
        return policy.sections.filter((section) => /shipping charges/i.test(section.title));
      }

      if (/tracking|track/.test(normalized)) {
        return policy.sections.filter((section) => /tracking orders/i.test(section.title));
      }

      if (/incorrect address|unavailability|delivery fail|re-delivery/.test(normalized)) {
        return policy.sections.filter((section) => /delivery issues/i.test(section.title));
      }

      return policy.sections.filter((section) =>
        /order processing|delivery time|shipping charges|tracking orders|delivery issues/i.test(
          section.title,
        ),
      );
    }

    if (policy.policy_name === "Return & Refund Policy") {
      if (/unused|eligible|eligibility|return window|condition/.test(normalized)) {
        return policy.sections.filter((section) => /return eligibility/i.test(section.title));
      }

      if (/process|how|return request|official channels|ship back/.test(normalized)) {
        return policy.sections.filter((section) => /return process/i.test(section.title));
      }

      if (/refund|payment method|inspection|processed/.test(normalized)) {
        return policy.sections.filter((section) => /refund processing/i.test(section.title));
      }

      if (/non-returnable|perishable|hygiene/.test(normalized)) {
        return policy.sections.filter((section) => /non-returnable/i.test(section.title));
      }

      if (/damaged|defective|replacement|proof/.test(normalized)) {
        return policy.sections.filter((section) => /damaged|defective/i.test(section.title));
      }

      return policy.sections.filter((section) =>
        /return eligibility|return process|refund processing|non-returnable|damaged/i.test(
          section.title,
        ),
      );
    }

    if (policy.policy_name === "Terms of Service") {
      if (/accept|agreement|agree|laws/.test(normalized)) {
        return policy.sections.filter((section) => /acceptance of terms/i.test(section.title));
      }

      if (/responsibilit|misuse|illegal|harmful|accurate information/.test(normalized)) {
        return policy.sections.filter((section) => /user responsibilities/i.test(section.title));
      }

      if (/product info|description|errors|correction/.test(normalized)) {
        return policy.sections.filter((section) => /product information/i.test(section.title));
      }

      if (/price|pricing|payment|processed/.test(normalized)) {
        return policy.sections.filter((section) => /pricing/i.test(section.title));
      }

      if (/liability|damages/.test(normalized)) {
        return policy.sections.filter((section) => /limitation of liability/i.test(section.title));
      }

      return policy.sections.filter((section) =>
        /acceptance of terms|user responsibilities|product information|pricing|liability/i.test(
          section.title,
        ),
      );
    }

    return policy.sections;
  }

  private resolvePolicyDocument(message: string): PolicyDocument | null {
    const normalized = message.toLowerCase();
    const policies = (policyData.policies ?? []) as PolicyDocument[];

    if (
      /privacy|data|collect|collection|share|sharing|third party|third parties|cookie|cookies|personal information|personal data|user rights|delete my data/.test(
        normalized,
      )
    ) {
      return policies.find((policy) => policy.policy_name === "Privacy Policy") ?? null;
    }

    if (/terms|service|website use|liability|pricing|payments/.test(normalized)) {
      return policies.find((policy) => policy.policy_name === "Terms of Service") ?? null;
    }

    if (/shipping|delivery|tracking|charges/.test(normalized)) {
      return policies.find((policy) => policy.policy_name === "Shipping Policy") ?? null;
    }

    if (/refund|return|exchange|damaged|defective/.test(normalized)) {
      return policies.find((policy) => policy.policy_name === "Return & Refund Policy") ?? null;
    }

    return null;
  }

  private buildProductResponse(products: ProductLookupResult[], userMessage: string): string {
    const rankedProducts = this.rankProductsForDisplay(products, userMessage);
    const isDealsRequest = /(deal|deals|bundle|combo|offer|offers)/i.test(userMessage);
    const rankedOrOriginal = rankedProducts.length > 0 ? rankedProducts : products;
    const highValueDeals = isDealsRequest
      ? rankedOrOriginal.filter((product) => this.parseDisplayPrice(product.price) >= 1000)
      : [];
    const displayProducts = (highValueDeals.length > 0 ? highValueDeals : rankedOrOriginal).slice(0, 4);
    const productPayload = displayProducts.map((product) => ({
      name: product.title,
      description: this.buildCustomerProductDescription(product),
      price: product.price ?? "",
      link: product.link,
      cart_link: product.cartLink ?? product.link,
    }));

    return JSON.stringify({
      type: "product",
      message: "Top Picks for You:",
      products: productPayload,
      policy_link: "",
      options: [
        { label: "Back", value: "show categories" },
        { label: "Home", value: "home" },
      ],
    });
  }

  private selectProductsForResponse(
    products: ProductLookupResult[],
    userMessage: string,
  ): ProductLookupResult[] {
    const rankedProducts = this.rankProductsForDisplay(products, userMessage);
    const isDealsRequest = /(deal|deals|bundle|combo|offer|offers)/i.test(userMessage);
    const rankedOrOriginal = rankedProducts.length > 0 ? rankedProducts : products;
    const highValueDeals = isDealsRequest
      ? rankedOrOriginal.filter((product) => this.parseDisplayPrice(product.price) >= 1000)
      : [];

    return (highValueDeals.length > 0 ? highValueDeals : rankedOrOriginal).slice(0, 5);
  }

  private buildPolicyKnowledge(
    policy: PolicyDocument,
    userMessage: string,
  ): Array<{
    id: string;
    name: string;
    text: string;
    link: string;
    type: string;
    category: string;
    source: string;
  }> {
    const sections = this.selectRelevantPolicySections(policy, userMessage).slice(0, 3);

    return sections.map((section, index) => ({
      id: `${policy.policy_name}-${index + 1}`,
      name: policy.policy_name,
      text: `${policy.policy_name}: ${this.toParagraphSentence(section.content)}`,
      link: policy.source,
      type: "policy",
      category: "policy",
      source: "policy_json",
    }));
  }

  private buildOrderResponse(order: Partial<NonNullable<AgentContext["order"]>> | undefined): string {
    const safeOrder = order ?? {};
    const contactParts = [
      safeOrder.customerPhone ? `Phone: ${safeOrder.customerPhone}` : "",
      safeOrder.shippingPhone && safeOrder.shippingPhone !== safeOrder.customerPhone
        ? `Shipping phone: ${safeOrder.shippingPhone}`
        : "",
      safeOrder.customerEmail ? `Email: ${safeOrder.customerEmail}` : "",
    ].filter(Boolean);

    const itemLines =
      Array.isArray(safeOrder.lineItems) && safeOrder.lineItems.length > 0
        ? safeOrder.lineItems
            .map((item) => {
              const title = item.title?.trim() || "Item";
              const variant = item.variantTitle?.trim();
              const quantity = Number.isFinite(item.quantity) ? `x${item.quantity}` : "";
              const amount =
                item.total && item.currencyCode ? `${item.currencyCode} ${item.total}` : item.total || "";
              return [title, variant, quantity, amount].filter(Boolean).join(" | ");
            })
            .filter(Boolean)
        : [];

    const trackingLines =
      Array.isArray(safeOrder.tracking) && safeOrder.tracking.length > 0
        ? safeOrder.tracking.map((tracking) =>
            [
              tracking.number ? `Tracking number: ${tracking.number}` : "",
              tracking.company ? `Carrier: ${tracking.company}` : "",
              tracking.status ? `Status: ${tracking.status}` : "",
            ]
              .filter(Boolean)
              .join(" | "),
          ).filter(Boolean)
        : [];

    const summaryBlocks = [
      safeOrder.orderName ? `Order: ${safeOrder.orderName}` : "",
      safeOrder.customerName ? `Customer: ${safeOrder.customerName}` : "",
      contactParts.length > 0 ? `Contact: ${contactParts.join(" | ")}` : "",
      safeOrder.fulfillmentStatus ? `Fulfillment: ${safeOrder.fulfillmentStatus}` : "",
      safeOrder.financialStatus ? `Payment: ${safeOrder.financialStatus}` : "",
      safeOrder.totalAmount
        ? `Total: ${safeOrder.currencyCode ? `${safeOrder.currencyCode} ` : ""}${safeOrder.totalAmount}`
        : "",
      itemLines.length > 0 ? `Order items:\n- ${itemLines.join("\n- ")}` : "",
      trackingLines.length > 0
        ? `Tracking:\n- ${trackingLines.join("\n- ")}`
        : "Tracking: Tracking will be shared after shipment if available.",
    ].filter(Boolean);

    return JSON.stringify({
      type: "fallback",
      message: summaryBlocks.join("\n\n"),
      order: {
        orderName: safeOrder.orderName,
        orderNumber: safeOrder.orderNumber,
        customerName: safeOrder.customerName,
        customerEmail: safeOrder.customerEmail,
        customerPhone: safeOrder.customerPhone,
        shippingPhone: safeOrder.shippingPhone,
        financialStatus: safeOrder.financialStatus,
        fulfillmentStatus: safeOrder.fulfillmentStatus,
        totalAmount: safeOrder.totalAmount,
        currencyCode: safeOrder.currencyCode,
        tracking: safeOrder.tracking,
        lineItems: safeOrder.lineItems,
      },
      products: [],
      policy_link: "",
      options: [
        { label: "Back", value: "show categories" },
        { label: "Home", value: "home" },
      ],
    });
  }

  private rankProductsForDisplay(
    products: ProductLookupResult[],
    userMessage: string,
  ): ProductLookupResult[] {
    const query = userMessage.toLowerCase();
    const tokens = query.split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
    const phrases = this.extractSearchCombinations(userMessage);
    const wantsSpicy = /spicy|peri|masala|paprika|salsa|hot/i.test(query);
    const wantsSweet = /sweet|choco|wafer|hazelnut|strawberry|cappuccino/i.test(query);
    const wantsBanana = /banana/i.test(query);
    const wantsPotato = /potato|patata/i.test(query);

    return products
      .map((product) => {
        const haystack = [
          product.title,
          product.productType,
          product.description,
          product.tags.join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        let score = 0;
        for (const token of tokens) {
          if (haystack.includes(token)) {
            score += 3;
          }
        }

        for (const phrase of phrases) {
          if (phrase.includes(" ") && haystack.includes(phrase)) {
            score += 6;
          }
        }

        if (wantsSpicy && /spicy|peri|masala|paprika|salsa|hot/i.test(haystack)) {
          score += 8;
        } else if (wantsSpicy) {
          score -= 6;
        }

        if (wantsSweet && /sweet|choco|wafer|hazelnut|strawberry|cappuccino/i.test(haystack)) {
          score += 8;
        } else if (wantsSweet) {
          score -= 6;
        }

        if (wantsBanana && /banana/i.test(haystack)) {
          score += 8;
        } else if (wantsBanana) {
          score -= 6;
        }

        if (wantsPotato && /potato|patata/i.test(haystack)) {
          score += 8;
        } else if (wantsPotato) {
          score -= 6;
        }

        return { product, score };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((item) => item.product);
  }

  private extractSearchCombinations(message: string): string[] {
    const normalized = message
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const tokens = normalized.split(" ").filter(Boolean);
    const phrases = new Set<string>([normalized]);

    for (let index = 0; index < tokens.length - 1; index += 1) {
      phrases.add(`${tokens[index]} ${tokens[index + 1]}`);
    }

    for (let index = 0; index < tokens.length - 2; index += 1) {
      phrases.add(`${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`);
    }

    if (normalized.includes("hot and spicy")) {
      phrases.add("hot spicy");
    }
    if (normalized.includes("multi grain")) {
      phrases.add("multigrain");
    }
    if (normalized.includes("tea time")) {
      phrases.add("evening snacks");
    }
    if (normalized.includes("movie night")) {
      phrases.add("party snacks");
    }

    return Array.from(phrases).filter(Boolean);
  }

  private buildCustomerProductDescription(product: ProductLookupResult): string {
    if (product.description && product.description !== "Snakitos snack from uploaded catalog.") {
      return product.description;
    }

    if (product.productType) {
      return `${product.productType} snack from Snakitos.`;
    }

    return "Snack from Snakitos.";
  }

  private parseDisplayPrice(price: string | null | undefined): number {
    const normalized = (price ?? "").replace(/,/g, "").trim();
    const value = Number.parseFloat(normalized);
    return Number.isFinite(value) ? value : 0;
  }

  private shortenPolicyContent(content: string): string {
    const normalized = content.trim();

    if (normalized.length <= 170) {
      return normalized;
    }

    const sentence = normalized.match(/^(.+?[.!?])(?:\s|$)/)?.[1];
    return sentence ?? `${normalized.slice(0, 167).trim()}...`;
  }

  private toParagraphSentence(content: string): string {
    const normalized = this.shortenPolicyContent(content).replace(/^\*\s*/, "").trim();
    return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
  }
}

export const supportAgentService = new SupportAgentService();
