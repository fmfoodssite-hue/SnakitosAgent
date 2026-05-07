import policyData from "../data/policies.json";
import { randomUUID } from "crypto";
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

type ProductResponseCard = {
  name: string;
  description: string;
  price: string;
  link: string;
  cart_link: string;
  savings?: string;
};

type SuggestionStrategy = {
  mode: "fast" | "full";
  query: string;
  rankingMessage: string;
};

const DEFAULT_SUGGESTION_LIMIT = 8;
const SESSION_LOOKUP_TIMEOUT_MS = 250;

type ChatSessionState = {
  canUseStoredContext: boolean;
  chatId: string;
  userId: string;
};

export class SupportAgentService {
  async handleChat(input: ChatRequestInput): Promise<ChatResponsePayload> {
    const normalizedPhone = normalizePhone(input.phone);
    const session = await this.resolveChatSession(input);
    const { chatId, userId } = session;

    this.runInBackground(
      this.persistMessage({
        chatId,
        content: input.message,
        email: input.email,
        phone: normalizedPhone,
        role: "user",
        userId,
      }),
    );

    try {
      if (this.isSensitiveRequest(input.message)) {
        const response =
          "I can help with snacks, orders, delivery, and store policies, but I can't share internal system or security details.";
        this.runInBackground(this.persistMessage({ chatId, content: response, role: "bot", userId }));

        return {
          response,
          intent: "general",
          chatId,
          userId,
        };
      }

      const initialIntent = detectIntent(input.message, input.phone);
      const intentResult =
        initialIntent.intent === "order" &&
        session.canUseStoredContext &&
        (!initialIntent.orderId || !initialIntent.phone)
          ? this.resolveIntentWithConversationContext(
              input.message,
              input.phone,
              await this.withTimeout(
                this.getOrderContextMessages(chatId, userId),
                250,
                [] as Array<{ role: "user" | "bot"; content: string }>,
              ),
            )
          : initialIntent;

      const response = await this.routeIntent(
        intentResult.intent,
        intentResult,
        input.message,
        chatId,
        input.clientKey,
      );
      const safeResponse = aiService.sanitizeCustomerResponse(response.response);

      this.runInBackground(
        Promise.allSettled([
          this.persistMessage({ chatId, content: safeResponse, role: "bot", userId }),
          this.logEvent("chat_processed", {
            chatId,
            userId,
            intent: response.intent,
          }),
        ]),
      );

      return {
        ...response,
        response: safeResponse,
        chatId,
        userId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown chat error";
      this.runInBackground(
        this.logEvent("chat_error", {
          chatId,
          userId,
          error: errorMessage,
        }),
      );

      const response = formatWhatsAppFallback(
        "We are having trouble processing your request right now.",
      );

      this.runInBackground(this.persistMessage({ chatId, content: response, role: "bot", userId }));
      return {
        response,
        intent: "general",
        chatId,
        userId,
      };
    }
  }

  private async resolveChatSession(input: ChatRequestInput): Promise<ChatSessionState> {
    const userId = input.userId?.trim() || randomUUID();
    const requestedChatId = input.chatId?.trim();

    if (!requestedChatId) {
      return {
        canUseStoredContext: false,
        chatId: randomUUID(),
        userId,
      };
    }

    const canUseStoredContext = await this.withTimeout(
      supabaseService.chatBelongsToUser(userId, requestedChatId),
      SESSION_LOOKUP_TIMEOUT_MS,
      false,
    );

    return {
      canUseStoredContext,
      chatId: canUseStoredContext ? requestedChatId : randomUUID(),
      userId,
    };
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
        response: await this.buildGreetingResponse(userMessage),
      };
    }

    if (intent === "order") {
      return this.handleOrderIntent(intentResult, userMessage, clientKey);
    }

    if (intent === "product") {
      return this.handleProductIntent(userMessage, chatId);
    }

    if (this.isPolicyQuestion(userMessage)) {
      return this.handlePolicyIntent(userMessage);
    }

    return this.handleGeneralIntent(userMessage);
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
        response: await this.buildResponseWithSuggestions({
          type: "fallback",
          message: [
            "I can check your order for you.",
            "Please type your details in this format:",
            "Order: #12345",
            "Phone: 03001234567",
            "Example: Order #12345, phone 03001234567",
          ].join("\n\n"),
          userMessage,
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
        response: await this.buildResponseWithSuggestions({
          type: "fallback",
          message: `I couldn't verify the order after several attempts.\n\nPlease wait about ${Math.ceil(blockState.retryAfterSeconds / 60)} minutes and try again, or contact support if you still need help.`,
          userMessage,
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
      this.runInBackground(
        this.logEvent("order_lookup_error", {
          orderId: intentResult.orderId,
          error: errorMessage,
        }),
      );

      return {
        intent: "order",
        response: formatWhatsAppFallback("I could not access the order system right now."),
      };
    }

    if (!order) {
      const failureState = recordOrderVerificationFailure(clientKey ?? "");
      this.runInBackground(
        this.logEvent("order_verification_failed", {
          orderId: intentResult.orderId,
          remainingAttempts: failureState.remainingAttempts,
          blocked: failureState.blocked,
        }),
      );

      return {
        intent: "order",
        response: failureState.blocked
          ? await this.buildResponseWithSuggestions({
              type: "fallback",
              message:
                "I couldn't verify the order after several attempts.\n\nPlease wait 15 minutes and try again, or contact support if you still need help.",
              userMessage,
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
      response: await this.buildOrderResponse(context.order ?? order, userMessage),
      data: order,
    };
  }

  private async handleProductIntent(
    userMessage: string,
    chatId: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    const recentMessages = await this.getRecentProductContext(chatId, userMessage);
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
      const shouldPreferRecommendations = this.shouldPreferRecommendationFlow(
        userMessage,
        productQuery,
        referencedProduct,
      );

      if (referencedProduct && !shouldPreferRecommendations) {
        products = await shopifyService.searchProducts(referencedProduct);
      } else if (productQuery && !shouldPreferRecommendations) {
        products = await shopifyService.searchProducts(productQuery);
      }

      const recommendationQuery = referencedProduct || productQuery || userMessage;
      const fastRecommendationsPromise = shopifyService
        .getQuickRecommendations(recommendationQuery, 50)
        .catch(() => []);

      if (
        shouldPreferRecommendations ||
        (products.length === 0 && isStoreBrowsingQuestion) ||
        (!productQuery && !referencedProduct)
      ) {
        products = await this.withTimeout(
          shopifyService.getStorefrontRecommendations(recommendationQuery, 50),
          1200,
          await fastRecommendationsPromise,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Product lookup failed";
      this.runInBackground(
        this.logEvent("product_lookup_error", {
          query: referencedProduct || productQuery || userMessage,
          chatId,
          error: errorMessage,
        }),
      );

      const fallbackProducts = await this.getFallbackProductRecommendations(
        referencedProduct || productQuery || userMessage,
      );
      if (fallbackProducts.length > 0) {
        const curatedProducts = this.selectProductsForResponse(fallbackProducts, userMessage);
        return {
          intent: "product",
          response: await this.buildProductResponse(curatedProducts, userMessage),
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
        return {
          intent: "product",
          response: await this.buildProductResponse(curatedProducts, userMessage),
          data: fallbackProducts,
        };
      }

      this.runInBackground(
        this.logEvent("product_not_found", {
          query: productQuery,
          chatId,
        }),
      );

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
    const shouldAnswerDirectly = this.shouldAnswerProductQuestionDirectly(
      userMessage,
      referencedProduct || productQuery,
      curatedProducts,
    );

    return {
      intent: "product",
      response: shouldAnswerDirectly
        ? await this.buildDirectProductAnswer(curatedProducts, userMessage)
        : await this.buildProductResponse(curatedProducts, userMessage),
      data: products,
    };
  }

  private async getOrderContextMessages(
    chatId: string,
    userId: string,
  ): Promise<Array<{ role: "user" | "bot"; content: string }>> {
    const [recentMessages, userRecentMessages] = await Promise.all([
      supabaseService.getRecentMessages(chatId),
      supabaseService.getRecentMessagesForUser(userId),
    ]);

    return [...userRecentMessages, ...recentMessages];
  }

  private async getRecentProductContext(
    chatId: string,
    userMessage: string,
  ): Promise<Array<{ role: "user" | "bot"; content: string }>> {
    if (!this.needsProductConversationContext(userMessage)) {
      return [];
    }

    return this.withTimeout(
      supabaseService.getRecentMessages(chatId),
      200,
      [] as Array<{ role: "user" | "bot"; content: string }>,
    );
  }

  private needsProductConversationContext(userMessage: string): boolean {
    return (
      (extractSelectionIndex(userMessage) ?? 0) > 0 ||
      /\b(this|that|these|those|same one|first|second|third|last one)\b/i.test(userMessage)
    );
  }

  private shouldPreferRecommendationFlow(
    userMessage: string,
    productQuery: string,
    referencedProduct: string,
  ): boolean {
    if (referencedProduct) {
      return false;
    }

    const normalized = productQuery || userMessage;
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;

    return (
      wordCount >= 4 ||
      /\b(best|top|recommend|suggest|good for|perfect for|for movie|for tea|for gift|under \d+|below \d+|spicy|sweet|salty|crispy|crunchy|party|sharing|combo|bundle|deal)\b/i.test(
        normalized,
      )
    );
  }

  private runInBackground(task: Promise<unknown>): void {
    void task.catch(() => undefined);
  }

  private async persistMessage(input: {
    chatId: string;
    content: string;
    email?: string;
    phone?: string;
    role: "user" | "bot";
    userId: string;
  }): Promise<void> {
    await supabaseService.upsertUser({
      id: input.userId,
      email: input.email,
      phone: input.phone,
    });
    await supabaseService.ensureChat(input.userId, input.chatId);
    await supabaseService.addMessage(input.chatId, input.role, input.content);
  }

  private async logEvent(event: string, metadata: Record<string, unknown>): Promise<void> {
    await supabaseService.logEvent(event, metadata);
  }

  private async withTimeout<T>(task: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    try {
      return await Promise.race([
        task,
        new Promise<T>((resolve) => {
          setTimeout(() => resolve(fallback), timeoutMs);
        }),
      ]);
    } catch {
      return fallback;
    }
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
    const deliveryLocationResponse = await this.buildDeliveryLocationResponse(userMessage);
    if (deliveryLocationResponse) {
      return {
        intent: "general",
        response: deliveryLocationResponse,
        data: [],
      };
    }

    const policyDocument = this.resolvePolicyDocument(userMessage);

    if (!policyDocument) {
      return {
        intent: "general",
        response: await this.buildResponseWithSuggestions({
          type: "policy",
          message: "I couldn't find that exact policy detail right now. Please contact support and we'll help you quickly.",
          userMessage,
          policyLink: "https://snakitos.com/policies/",
          options: [
            { label: "Back", value: "show categories" },
            { label: "Home", value: "home" },
          ],
          skipSuggestions: true,
        }),
        data: [],
      };
    }

    const knowledge = this.buildPolicyKnowledge(policyDocument, userMessage);

    return {
      intent: "general",
      response: await this.buildKnowledgeResponse(knowledge, userMessage),
      data: policyDocument,
    };
  }

  private async buildDeliveryLocationResponse(userMessage: string): Promise<string | null> {
    if (!this.isDeliveryLocationQuestion(userMessage)) {
      return null;
    }

    const location = this.extractDeliveryLocation(userMessage);
    const locationLine = location
      ? `Yes, delivery is available in ${location} and across Pakistan.`
      : "Yes, delivery is available all over Pakistan.";

    const message = [
      locationLine,
      "Shipping charges and delivery timing depend on location, order size, and current promotions.",
      "The final charges are shown at checkout.",
    ].join("\n\n");

    return this.buildResponseWithSuggestions({
      type: "policy",
      message,
      userMessage,
      policyLink: "https://snakitos.com/policies/shipping-policy",
      suggestionSeed: "best family snack bundles",
      options: [
        { label: "Shipping Policy", value: "show shipping and refund policy" },
        { label: "Track Order", value: "track my order" },
        { label: "Home", value: "home" },
      ],
      skipSuggestions: true,
    });
  }

  private async handleGeneralIntent(
    userMessage: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    if (this.isUnclearQuery(userMessage)) {
      return {
        intent: "general",
        response: await this.buildResponseWithSuggestions({
          type: "fallback",
          message: "I can help with snacks, orders, delivery, and store policies.",
          userMessage,
          options: [
            { label: "Deals", value: "show best deals" },
            { label: "Track Order", value: "track my order" },
            { label: "Policies", value: "show shipping and refund policy" },
            { label: "Home", value: "home" },
          ],
          skipSuggestions: true,
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
        response: await this.buildResponseWithSuggestions({
          type: "fallback",
          message: "I couldn't find exact details, but here's what I know...",
          userMessage,
          options: [
            { label: "Deals", value: "show best deals" },
            { label: "Policies", value: "show shipping and refund policy" },
            { label: "Home", value: "home" },
          ],
          skipSuggestions: true,
        }),
        data: [],
      };
    }

    return {
      intent: "general",
      response: await this.buildKnowledgeResponse(relevantKnowledge, userMessage),
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
    return /(policy|policies|privacy|terms|service|return|refund|shipping|delivery|exchange|cancel|cancellation|payment|cookie|cookies|third party|third parties|personal data|personal information|what data|collect|collection|tracking|charges|refund window|damaged|defective)/i.test(
      message,
    );
  }

  private isDeliveryLocationQuestion(message: string): boolean {
    return /(delivery|shipping|deliver)\b/i.test(message) && /\b(in|to|for)\b/i.test(message);
  }

  private extractDeliveryLocation(message: string): string {
    const match = message.match(
      /\b(?:in|to|for)\s+([a-z][a-z\s-]{2,})(?:\?|$|,|\.|\s+(?:possible|available|serviceable|delivery|shipping))/i,
    );

    const raw = match?.[1]?.trim() ?? "";
    if (!raw) {
      return "";
    }

    return raw
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  private async buildGreetingResponse(userMessage: string): Promise<string> {
    if (/^(show categories|collections|menu)$/i.test(userMessage.trim())) {
      return this.buildResponseWithSuggestions({
        type: "fallback",
        message: "Browse the main snack collections below.",
        userMessage,
        options: [
          { label: "Sweet Tooth", value: "Show me Sweet Tooth snacks" },
          { label: "Multi Grain", value: "Show me Multi Grain snacks" },
          { label: "Banana Chips", value: "Show me Banana Chips" },
          { label: "Nachos", value: "Show me Nachos" },
          { label: "Deals", value: "show best deals" },
          { label: "Track Order", value: "track my order" },
          { label: "Home", value: "home" },
        ],
        skipSuggestions: true,
      });
    }

    return this.buildResponseWithSuggestions({
      type: "fallback",
      message: "I can help you find snacks, track orders, and check delivery or policy details.",
      userMessage,
      suggestionSeed: "best snack deals",
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

  private async buildProductResponse(products: ProductLookupResult[], userMessage: string): Promise<string> {
    const rankedProducts = this.rankProductsForDisplay(products, userMessage);
    const isDealsRequest = this.isHighTicketIntent(userMessage);
    const rankedOrOriginal = rankedProducts.length > 0 ? rankedProducts : products;
    const highValueDeals = isDealsRequest
      ? rankedOrOriginal.filter((product) => this.parseDisplayPrice(product.price) >= 1000)
      : [];
    const selectedProducts =
      highValueDeals.length > 0
        ? [
            ...highValueDeals,
            ...rankedOrOriginal.filter(
              (product) => !highValueDeals.some((candidate) => candidate.id === product.id),
            ),
          ]
        : rankedOrOriginal;
    const displayProducts = this.sortProductsForPresentation(selectedProducts, userMessage).slice(
      0,
      DEFAULT_SUGGESTION_LIMIT,
    );
    const productPayload = this.buildProductCards(displayProducts, userMessage);
    const bestMatch = productPayload[0];
    const totalSavings = this.sumDisplayedSavings(productPayload);
    const message = bestMatch
      ? this.buildProductMessage(bestMatch, userMessage, displayProducts.length, totalSavings)
      : "Top Picks for You:";

    return this.buildResponseWithSuggestions({
      type: "product",
      message,
      userMessage,
      products: productPayload,
      options: [
        { label: "Back", value: "show categories" },
        { label: "Home", value: "home" },
      ],
    });
  }

  private async buildDirectProductAnswer(
    products: ProductLookupResult[],
    userMessage: string,
  ): Promise<string> {
    const displayProducts = this.sortProductsForPresentation(products, userMessage).slice(
      0,
      Math.min(products.length, 3),
    );
    const productPayload = this.buildProductCards(displayProducts, userMessage);
    const bestMatch = displayProducts[0];
    const names = displayProducts.map((product) => product.title);

    let message = "I couldn't find exact details, but here's what I know...";

    if (bestMatch) {
      const crispDescription = this.extractDirectProductDescription(bestMatch);
      const productListLine =
        names.length > 1 ? `I found these close matches: ${names.join(", ")}.` : `I found ${names[0]}.`;
      message = `${message}\n\n${productListLine}\n\n${crispDescription}`;
    }

    return this.buildResponseWithSuggestions({
      type: "product",
      message,
      userMessage,
      products: productPayload,
      options: [
        { label: "Back", value: "show categories" },
        { label: "Home", value: "home" },
      ],
      skipSuggestions: true,
    });
  }

  private selectProductsForResponse(
    products: ProductLookupResult[],
    userMessage: string,
  ): ProductLookupResult[] {
    const rankedProducts = this.rankProductsForDisplay(products, userMessage);
    const isDealsRequest = this.isHighTicketIntent(userMessage);
    const rankedOrOriginal = rankedProducts.length > 0 ? rankedProducts : products;
    const highValueDeals = isDealsRequest
      ? rankedOrOriginal.filter((product) => this.isLargeFormatProduct(product, userMessage))
      : [];
    const orderedProducts =
      highValueDeals.length > 0
        ? [
            ...highValueDeals,
            ...rankedOrOriginal.filter(
              (product) => !highValueDeals.some((candidate) => candidate.id === product.id),
            ),
          ]
        : rankedOrOriginal;

    return this.sortProductsForPresentation(
      orderedProducts,
      userMessage,
    ).slice(0, DEFAULT_SUGGESTION_LIMIT);
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

  private async buildKnowledgeResponse(
    knowledge: Array<{
      id: string;
      name: string;
      text: string;
      link: string;
      type: string;
      category: string;
      source: string;
    }>,
    userMessage: string,
  ): Promise<string> {
    const topKnowledge = knowledge.slice(0, 3);
    const policyLink =
      topKnowledge.find((item) => item.type === "policy" && item.link)?.link ?? "";
    const type =
      topKnowledge.length > 0 && topKnowledge.every((item) => item.type === "policy")
        ? "policy"
        : "mixed";

    const snippets = topKnowledge
      .map((item) => this.normalizeKnowledgeSnippet(item.text, item.name))
      .filter(Boolean)
      .slice(0, 2);

    const intro = policyLink
      ? "Here’s the quick policy update from Snakitos."
      : "Here’s what I found.";

    const message = [intro, ...snippets].join("\n\n");
    const options = this.isPolicyQuestion(userMessage)
      ? [
          { label: "Shipping Policy", value: "show shipping and refund policy" },
          { label: "Track Order", value: "track my order" },
          { label: "Home", value: "home" },
        ]
      : [
          { label: "Deals", value: "show best deals" },
          { label: "Track Order", value: "track my order" },
          { label: "Home", value: "home" },
        ];

    return this.buildResponseWithSuggestions({
      type,
      message,
      userMessage,
      policyLink,
      options,
      skipSuggestions: type === "policy",
    });
  }

  private async buildOrderResponse(
    order: Partial<NonNullable<AgentContext["order"]>> | undefined,
    userMessage: string,
  ): Promise<string> {
    const safeOrder = order ?? {};
    const contactParts = [
      safeOrder.customerPhone ? `Phone: ${safeOrder.customerPhone}` : "",
      safeOrder.shippingPhone && safeOrder.shippingPhone !== safeOrder.customerPhone
        ? `Shipping phone: ${safeOrder.shippingPhone}`
        : "",
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

    return this.buildResponseWithSuggestions({
      type: "fallback",
      message: summaryBlocks.join("\n\n"),
      userMessage,
      order: {
        orderName: safeOrder.orderName,
        orderNumber: safeOrder.orderNumber,
        customerName: safeOrder.customerName,
        customerPhone: safeOrder.customerPhone,
        shippingPhone: safeOrder.shippingPhone,
        financialStatus: safeOrder.financialStatus,
        fulfillmentStatus: safeOrder.fulfillmentStatus,
        totalAmount: safeOrder.totalAmount,
        currencyCode: safeOrder.currencyCode,
        tracking: safeOrder.tracking,
        lineItems: safeOrder.lineItems,
      },
      options: [
        { label: "Back", value: "show categories" },
        { label: "Home", value: "home" },
      ],
    });
  }

  private async buildResponseWithSuggestions(input: {
    type: "product" | "policy" | "mixed" | "fallback";
    message: string;
    userMessage: string;
    options: Array<{ label: string; value: string }>;
    products?: ProductResponseCard[];
    policyLink?: string;
    order?: Record<string, unknown>;
    suggestionSeed?: string;
    skipSuggestions?: boolean;
  }): Promise<string> {
    const baseProducts = input.products ?? [];
    const suggestionStrategy = this.shouldAttachSuggestions(input)
      ? this.buildSuggestionStrategy(input)
      : null;
    const suggestions =
      input.skipSuggestions
        ? []
        : baseProducts.length > 0
        ? baseProducts
        : suggestionStrategy
          ? await this.getSuggestedProductCards(
              suggestionStrategy.query,
              suggestionStrategy.rankingMessage,
              suggestionStrategy.mode,
            )
          : [];

    return JSON.stringify({
      type: input.type,
      message: input.message,
      ...(input.order ? { order: input.order } : {}),
      products: suggestions,
      policy_link: input.policyLink ?? "",
      options: input.options,
    });
  }

  private shouldAttachSuggestions(input: {
    type: "product" | "policy" | "mixed" | "fallback";
    userMessage: string;
    suggestionSeed?: string;
    order?: Record<string, unknown>;
  }): boolean {
    if (input.type === "product") {
      return true;
    }

    if (input.suggestionSeed || input.order) {
      return true;
    }

    return this.looksLikeProductDiscovery(input.userMessage);
  }

  private async getSuggestedProductCards(
    query: string,
    rankingMessage: string,
    mode: "fast" | "full" = "fast",
  ): Promise<ProductResponseCard[]> {
    try {
      const recommendations = await Promise.race([
        mode === "full"
          ? shopifyService.getStorefrontRecommendations(query, DEFAULT_SUGGESTION_LIMIT * 2)
          : shopifyService.getQuickRecommendations(query, DEFAULT_SUGGESTION_LIMIT * 2),
        new Promise<ProductLookupResult[]>((resolve) => {
          setTimeout(() => resolve([]), mode === "full" ? 900 : 350);
        }),
      ]);

      const selected = this.selectProductsForResponse(recommendations, rankingMessage).slice(
        0,
        DEFAULT_SUGGESTION_LIMIT,
      );
      return this.buildProductCards(selected, rankingMessage);
    } catch {
      return [];
    }
  }

  private buildSuggestionStrategy(input: {
    type: "product" | "policy" | "mixed" | "fallback";
    userMessage: string;
    suggestionSeed?: string;
    order?: Record<string, unknown>;
  }): SuggestionStrategy {
    if (input.suggestionSeed) {
      return {
        mode: "full",
        query: input.suggestionSeed,
        rankingMessage: input.suggestionSeed,
      };
    }

    if (input.type === "product") {
      return {
        mode: "full",
        query: input.userMessage,
        rankingMessage: input.userMessage,
      };
    }

    const orderSuggestionSeed = this.getOrderSuggestionSeed(input.order, input.userMessage);
    if (orderSuggestionSeed) {
      return {
        mode: "full",
        query: orderSuggestionSeed,
        rankingMessage: orderSuggestionSeed,
      };
    }

    if (this.isPolicyQuestion(input.userMessage)) {
      const policySuggestionSeed = this.getPolicySuggestionSeed(input.userMessage);
      return {
        mode: "full",
        query: policySuggestionSeed,
        rankingMessage: policySuggestionSeed,
      };
    }

    if (this.looksLikeProductDiscovery(input.userMessage)) {
      return {
        mode: "full",
        query: input.userMessage,
        rankingMessage: input.userMessage,
      };
    }

    return {
      mode: "fast",
      query: "best selling snack deals",
      rankingMessage: "best selling snack deals",
    };
  }

  private getOrderSuggestionSeed(
    order: Record<string, unknown> | undefined,
    userMessage: string,
  ): string {
    const lineItems = Array.isArray(order?.lineItems)
      ? (order.lineItems as Array<{ title?: string }>)
      : [];
    const titles = lineItems
      .map((item) => item.title?.trim() || "")
      .filter(Boolean)
      .slice(0, 3);

    if (titles.length > 0) {
      return `${titles.join(" ")} reorder bundle`;
    }

    if (/track|order|delivery|shipment|courier|status/i.test(userMessage)) {
      return "best selling snack deals";
    }

    return "";
  }

  private getPolicySuggestionSeed(userMessage: string): string {
    if (/(healthy|healthwise|health\s*wise|gluten|wheat free|multi\s*grain|multigrain)/i.test(userMessage)) {
      return "healthy multigrain snacks";
    }

    if (/(sweet|wafer|choco|chocolate|dessert)/i.test(userMessage)) {
      return "sweet tooth snack deals";
    }

    if (/(banana)/i.test(userMessage)) {
      return "banana chips best sellers";
    }

    if (/(nachos|movie|party|sharing|family)/i.test(userMessage)) {
      return "family snack bundles nachos";
    }

    if (/(refund|return|exchange|damaged|defective)/i.test(userMessage)) {
      return "popular snack bundles";
    }

    if (/(shipping|delivery|tracking|charges|policy)/i.test(userMessage)) {
      return "best selling snack deals";
    }

    return "popular snacks";
  }

  private looksLikeProductDiscovery(message: string): boolean {
    return /(best|top|recommend|suggest|deal|bundle|combo|snack|snacks|sweet|spicy|salty|crispy|crunchy|healthy|banana|nachos|wafer|gift|family|movie night|tea time)/i.test(
      message,
    );
  }

  private shouldAnswerProductQuestionDirectly(
    userMessage: string,
    resolvedQuery: string,
    products: ProductLookupResult[],
  ): boolean {
    if (!resolvedQuery || products.length === 0 || this.looksLikeProductDiscovery(userMessage)) {
      return false;
    }

    return /\b(are|is|do|does|did|can|could|would|will|what|which|how|why|ingredient|ingredients|made of|made from|fried|dried|baked|vegan|vegetarian|halal|gluten|spicy|sweet|salty|flavour|flavor)\b/i.test(
      userMessage,
    );
  }

  private extractDirectProductDescription(product: ProductLookupResult): string {
    const description =
      product.description && product.description !== "Snakitos snack from uploaded catalog."
        ? product.description.trim()
        : "";

    if (description) {
      return /[.!?]$/.test(description) ? description : `${description}.`;
    }

    if (product.productType) {
      return `${product.title} is listed as a ${product.productType} snack on Snakitos.`;
    }

    return `${product.title} is listed on the Snakitos store, but the catalog does not include more detailed product notes.`;
  }

  private buildProductCards(
    products: ProductLookupResult[],
    userMessage: string,
  ): ProductResponseCard[] {
    return products.map((product) => {
      const savings = this.estimateSavings(product, products);
      const priceLabel = this.resolveProductPriceLabel(product);
      return {
        name: product.title,
        description: this.buildCustomerProductDescription(product, savings, userMessage),
        price: priceLabel,
        link: product.link,
        cart_link: product.cartLink ?? product.link,
        ...(savings ? { savings: savings.toFixed(0) } : {}),
      };
    });
  }

  private resolveProductPriceLabel(product: ProductLookupResult): string {
    if (product.price && this.parseDisplayPrice(product.price) > 0) {
      return product.price;
    }

    const variantPrice = product.variants.find(
      (variant) => this.parseDisplayPrice(variant.price) > 0,
    )?.price;
    if (variantPrice) {
      return variantPrice;
    }

    return "See store";
  }

  private buildProductMessage(
    bestMatch: ProductResponseCard,
    userMessage: string,
    totalCount: number,
    totalSavings: number,
  ): string {
    if (this.isHighTicketIntent(userMessage)) {
      const savingsLine =
        totalSavings > 0
          ? ` Estimated savings across these value picks: PKR ${totalSavings.toFixed(0)}.`
          : "";
      return totalCount > 1
        ? `Best value pick: ${bestMatch.name}. I also added more strong-value options below.${savingsLine}`
        : `Best value pick: ${bestMatch.name}.${savingsLine}`;
    }

    return totalCount > 1
      ? `${bestMatch.name} looks like a strong match. I also added a few close picks below.`
      : `${bestMatch.name} looks like a strong match.`;
  }

  private isHighTicketIntent(userMessage: string): boolean {
    return /(deal|deals|bundle|combo|offer|offers|value pack|gift pack|family pack|family|sharing|share pack|box|high ticket|premium|bulk|party|movie night)/i.test(
      userMessage,
    );
  }

  private isLargeFormatProduct(
    product: ProductLookupResult,
    userMessage: string,
  ): boolean {
    const title = product.title.toLowerCase();
    const description = (product.description ?? "").toLowerCase();
    const combined = `${title} ${description}`;
    const price = this.parseDisplayPrice(product.price);
    const isFamilyIntent = /(family|sharing|party|bundle|combo|box|bulk|gift|movie night|pack)/i.test(
      userMessage,
    );

    if (/(bundle|combo|box|tray|gift|fiesta|fusion|wonder|treasure|movie|family|sharing)/i.test(combined)) {
      return true;
    }

    const packMatch = combined.match(/pack of\s*(\d+)/i);
    const packCount = packMatch ? Number.parseInt(packMatch[1], 10) : 0;
    if (packCount >= 20) {
      return true;
    }

    if (isFamilyIntent && price >= 900) {
      return true;
    }

    if (isFamilyIntent && /(free shipping|assorted|mixed)/i.test(combined)) {
      return true;
    }

    return false;
  }

  private estimateSavings(
    product: ProductLookupResult,
    products: ProductLookupResult[],
  ): number | null {
    const packMatch = product.title.match(/pack of\s*(\d+)/i);
    if (!packMatch) {
      return null;
    }

    const quantity = Number.parseInt(packMatch[1], 10);
    if (!Number.isFinite(quantity) || quantity <= 1 || !product.price) {
      return null;
    }

    const normalizedPackTitle = product.title
      .replace(/\s*pack of\s*\d+.*$/i, "")
      .replace(/\s*-\s*\d+g.*$/i, "")
      .trim()
      .toLowerCase();

    const singleMatch = products.find((candidate) => {
      if (candidate.id === product.id || !candidate.price) {
        return false;
      }

      const candidateTitle = candidate.title
        .replace(/\s*pack of\s*\d+.*$/i, "")
        .replace(/\s*-\s*\d+g.*$/i, "")
        .trim()
        .toLowerCase();

      return candidateTitle === normalizedPackTitle && !/pack of/i.test(candidate.title);
    });

    if (!singleMatch?.price) {
      return null;
    }

    const packPrice = this.parseDisplayPrice(product.price);
    const singlePrice = this.parseDisplayPrice(singleMatch.price);
    if (packPrice <= 0 || singlePrice <= 0) {
      return null;
    }

    const savings = singlePrice * quantity - packPrice;
    return savings > 0 ? savings : null;
  }

  private sumDisplayedSavings(products: ProductResponseCard[]): number {
    return products.reduce((sum, product) => {
      const savings = Number.parseFloat(product.savings ?? "");
      return Number.isFinite(savings) ? sum + savings : sum;
    }, 0);
  }

  private sortProductsForPresentation(
    products: ProductLookupResult[],
    userMessage: string,
  ): ProductLookupResult[] {
    const isHighTicket = this.isHighTicketIntent(userMessage);
    const copied = [...products];

    if (!isHighTicket) {
      return copied;
    }

    return copied.sort((left, right) => {
      const rightPrice = this.parseDisplayPrice(right.price);
      const leftPrice = this.parseDisplayPrice(left.price);
      if (rightPrice !== leftPrice) {
        return rightPrice - leftPrice;
      }

      const rightPack = this.extractPackCount(right.title);
      const leftPack = this.extractPackCount(left.title);
      if (rightPack !== leftPack) {
        return rightPack - leftPack;
      }

      return (right.unitsSold ?? 0) - (left.unitsSold ?? 0);
    });
  }

  private extractPackCount(title: string): number {
    const match = title.match(/pack of\s*(\d+)/i);
    if (!match) {
      return 0;
    }

    const count = Number.parseInt(match[1], 10);
    return Number.isFinite(count) ? count : 0;
  }

  private normalizeKnowledgeSnippet(text: string, fallbackName: string): string {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) {
      return fallbackName;
    }

    const withoutPrefix = trimmed
      .replace(new RegExp(`^${this.escapeRegExp(fallbackName)}\\s+(?:is|explains|contains)\\s+`, "i"), "")
      .replace(/^this\s+/i, "")
      .trim();

    return this.shortenPolicyContent(withoutPrefix || trimmed);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const wantsFamily = /family|sharing|party|bundle|combo|gift|bulk|box|movie night/i.test(query);

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

        if (wantsFamily) {
          if (/(bundle|combo|box|tray|gift|family|sharing|movie|assorted|mixed)/i.test(haystack)) {
            score += 12;
          }

          const packMatch = haystack.match(/pack of\s*(\d+)/i);
          const packCount = packMatch ? Number.parseInt(packMatch[1], 10) : 0;
          if (packCount >= 20) {
            score += 10;
          } else if (packCount > 0 && packCount < 20) {
            score -= 8;
          }

          const price = this.parseDisplayPrice(product.price);
          if (price >= 900) {
            score += 8;
          } else if (price > 0 && price < 700) {
            score -= 8;
          }
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

  private buildCustomerProductDescription(
    product: ProductLookupResult,
    savings?: number | null,
    userMessage?: string,
  ): string {
    let description =
      product.description && product.description !== "Snakitos snack from uploaded catalog."
        ? product.description
        : product.productType
          ? `${product.productType} snack from Snakitos.`
          : "Snack from Snakitos.";

    if (savings && this.isHighTicketIntent(userMessage ?? "")) {
      description = `${description} Save PKR ${savings.toFixed(0)} versus buying singles.`;
    }

    return description;
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
