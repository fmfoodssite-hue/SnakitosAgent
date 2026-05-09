import policyData from "../data/policies.json";
import productMetadata from "../data/product-metadata.json";
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

type ProductMetadataRule = {
  matchAny: string[];
  halal?: boolean;
  halalCertificate?: string;
  halalCertificateMessage?: string;
  expiry?: string;
  ingredientsSummary?: string;
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
    const startedAt = Date.now();
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
            ...this.buildChatAuditMetadata({
              chatId,
              data: response.data,
              intent: response.intent,
              response: safeResponse,
              responseTimeMs: Date.now() - startedAt,
              userId,
              userMessage: input.message,
            }),
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
          error: errorMessage,
          responseTimeMs: Date.now() - startedAt,
          status: "failure",
          userId,
          userMessage: input.message,
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

    const prioritySupportResponse = await this.buildPrioritySupportResponse(userMessage);
    if (prioritySupportResponse) {
      return {
        intent: "general",
        response: prioritySupportResponse,
        data: [],
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

  private async buildPrioritySupportResponse(userMessage: string): Promise<string | null> {
    const complaintResponse = await this.buildComplaintOrEscalationResponse(userMessage);
    if (complaintResponse) {
      return complaintResponse;
    }

    return this.buildTrustAndPolicyFaqResponse(userMessage);
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
          skipSuggestions: true,
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
          skipSuggestions: true,
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
              skipSuggestions: true,
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
    if (
      /\b(certificate|certification|halal certificate|certificate chahiye|certificate chaiye|certificate do)\b/i.test(
        userMessage,
      ) &&
      !this.hasSpecificProductDetailTarget(userMessage)
    ) {
      return {
        intent: "product",
        response: await this.buildResponseWithSuggestions({
          type: "fallback",
          message:
            "Yes, our products are halal and approved by Pakistan Halal Authority (PHA) and Sindh. If you need the halal certificate, our support team can share it on request.",
          userMessage,
          options: [
            { label: "Contact Support", value: "How can I contact support?" },
            { label: "Home", value: "home" },
          ],
          skipSuggestions: true,
        }),
        data: [],
      };
    }

    if (this.shouldAskRecommendationFollowUp(userMessage)) {
      return {
        intent: "product",
        response: await this.buildRecommendationFollowUpResponse(userMessage),
        data: [],
      };
    }

    const curatedProductInfoResponse = await this.buildCuratedProductInfoResponse(userMessage);
    if (curatedProductInfoResponse) {
      return {
        intent: "product",
        response: curatedProductInfoResponse,
        data: [],
      };
    }

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

  private buildChatAuditMetadata(input: {
    chatId: string;
    data?: unknown;
    intent: AgentIntent;
    response: string;
    responseTimeMs: number;
    userId: string;
    userMessage: string;
  }): Record<string, unknown> {
    const retrievedContext = this.extractKnowledgeAuditContext(input.data);

    return {
      chatId: input.chatId,
      detailsSummary:
        input.intent === "general" && retrievedContext.length > 0
          ? `Answered using ${retrievedContext.length} retrieved knowledge matches.`
          : input.intent === "product"
            ? "Answered using product search or recommendation flow."
            : input.intent === "order"
              ? "Answered using order support flow."
              : "Answered using support flow.",
      intent: input.intent,
      response: input.response,
      responseTimeMs: input.responseTimeMs,
      retrievedContext,
      sourceLabel:
        input.intent === "general" && retrievedContext.length > 0
          ? this.resolveKnowledgeSourceLabel(retrievedContext)
          : input.intent === "product"
            ? "Catalog lookup"
            : input.intent === "order"
              ? "Order support"
              : "General support",
      status: "success",
      userId: input.userId,
      userMessage: input.userMessage,
    };
  }

  private extractKnowledgeAuditContext(data: unknown): Array<Record<string, string>> {
    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .filter(
        (item) =>
          item &&
          typeof item === "object" &&
          "name" in item &&
          "source" in item,
      )
      .slice(0, 6)
      .map((item, index) => {
        const entry = item as Record<string, unknown>;
        return {
          category: String(entry.category ?? "general"),
          id: String(entry.id ?? `knowledge-${index}`),
          link: String(entry.link ?? ""),
          name: String(entry.name ?? "Knowledge match"),
          source: String(entry.source ?? "unknown"),
          type: String(entry.type ?? "knowledge"),
        };
      });
  }

  private resolveKnowledgeSourceLabel(context: Array<Record<string, string>>): string {
    const sources = new Set(context.map((item) => item.source));
    if (sources.has("pinecone")) {
      return "RAG + Pinecone";
    }
    if (sources.has("general_query_pack")) {
      return "General query RAG";
    }
    if (sources.has("capability_doc")) {
      return "Capability knowledge";
    }
    return "Knowledge retrieval";
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
    const quickSupportResponse = await this.buildQuickSupportResponse(userMessage);
    if (quickSupportResponse) {
      return {
        intent: "general",
        response: quickSupportResponse,
        data: [],
      };
    }

    if (this.isUnclearQuery(userMessage)) {
      return {
        intent: "general",
        response: await this.buildGeneralPlaybookResponse({
          userMessage,
          answer: "Sure, I can help with snacks, orders, delivery, and store policies.",
          assistLine: "Just tell me what you need, and I'll keep it simple.",
          type: "fallback",
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
        response: await this.buildGeneralPlaybookResponse({
          userMessage,
          answer: "I don't have the exact detail right now, but I'm happy to help.",
          assistLine: "If you want, I can still help with products, delivery, refunds, or order tracking.",
          type: "fallback",
          options: [
            { label: "Deals", value: "show best deals" },
            { label: "Policies", value: "show shipping and refund policy" },
            { label: "Home", value: "home" },
          ],
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

  private async buildQuickSupportResponse(userMessage: string): Promise<string | null> {
    if (/\b(certificate|certification|certificate chahiye|certificate chaiye|certificate do)\b/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "Yes, our products are halal and approved by Pakistan Halal Authority (PHA) and Sindh.",
        assistLine: "If you need the halal certificate, our support team can share it on request.",
        type: "fallback",
        options: [
          { label: "Contact Support", value: "How can I contact support?" },
          { label: "Home", value: "home" },
        ],
      });
    }

    return this.buildStoreInfoResponse(userMessage);
  }

  private async buildComplaintOrEscalationResponse(userMessage: string): Promise<string | null> {
    const normalized = userMessage.toLowerCase();
    const hasFrustrationSignal =
      /(angry|annoyed|confused|upset|frustrated|not clear|not happy|issue|problem|complaint|why is this not clear)/i.test(
        normalized,
      );
    const hasSensitiveSupportTopic =
      /(official website|real store|who owns|brand|deliver|delivery|refund|return|payment|courier|track|parcel|support|policy|late|confirmation|tomorrow|order not placed)/i.test(
        normalized,
      );

    if (hasFrustrationSignal && hasSensitiveSupportTopic) {
      return this.buildResponseWithSuggestions({
        type: "fallback",
        message:
          "I’m sorry this feels unclear. I’m forwarding this to our support team so they can help you properly and quickly.",
        userMessage,
        options: [
          { label: "Contact Support", value: "How can I contact support?" },
          { label: "Home", value: "home" },
        ],
        skipSuggestions: true,
      });
    }

    if (
      /(damaged|broken|wrong order|wrong item|wrong product|late delivery|missing order|missing product|payment failed|payment issue|payment deducted|order not placed|refund dispute|angry|complaint|issue with order|website issue|technical issue|wholesale|bulk order)/i.test(
        normalized,
      )
    ) {
      const message = /(wholesale|bulk order)/i.test(normalized)
        ? "I’m forwarding this to our support team so they can assist you better with the bulk order 😊"
        : "We’re sorry about the inconvenience. Please share your order number so we can help quickly. If needed, I’ll connect you with our support team for faster assistance.";

      return this.buildResponseWithSuggestions({
        type: "fallback",
        message,
        userMessage,
        options: [
          { label: "Track Order", value: "track my order" },
          { label: "Policies", value: "show shipping and refund policy" },
          { label: "Home", value: "home" },
        ],
        skipSuggestions: true,
      });
    }

    return null;
  }

  private async buildTrustAndPolicyFaqResponse(userMessage: string): Promise<string | null> {
    if (/(which courier do you use|courier service|courier company|kon sa courier|courier konsa hai)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "Courier handling can vary depending on the order and delivery area.",
        assistLine: "If tracking is available, the details are usually shared after confirmation or dispatch.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/shipping-policy",
        options: [
          { label: "Shipping Policy", value: "show shipping and refund policy" },
          { label: "Track Order", value: "track my order" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(how do i track my parcel|track my parcel|track parcel|parcel tracking|tracking details|track shipment)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "If tracking is available for your order, the tracking details are usually shared after confirmation or dispatch.",
        assistLine: "If you want me to check a specific order, just send your order number and phone number.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/shipping-policy",
        options: [
          { label: "Track Order", value: "track my order" },
          { label: "Shipping Policy", value: "show shipping and refund policy" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(late delivery|delivery late|why is my delivry late|why is my delivery late|parcel late)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "Delivery timing can vary because of location, courier availability, weather, public holidays, or order volume.",
        assistLine: "If you want, I can also help you check a specific order status.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/shipping-policy",
        options: [
          { label: "Track Order", value: "track my order" },
          { label: "Shipping Policy", value: "show shipping and refund policy" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(do you accept opened items|opened items|opened product return|opened pack return)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "Opened or used items may not qualify unless the active return policy allows it.",
        assistLine: "If you want, I can also show the return policy or help you contact support.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/refund-policy",
        options: [
          { label: "Refund Policy", value: "show shipping and refund policy" },
          { label: "Contact Support", value: "How can I contact support?" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(return an item|retrn an item|how can i return an item|return item process)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "To return an item, please contact support with your order number, item details, and the issue.",
        assistLine: "If the return is eligible under the policy, the team will guide you through the next steps.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/refund-policy",
        options: [
          { label: "Refund Policy", value: "show shipping and refund policy" },
          { label: "Contact Support", value: "How can I contact support?" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(can i add item after ordering|add item after ordering|add more items after order)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "That usually depends on whether the order has already been processed.",
        assistLine: "Please contact support quickly with your order details so they can check what is still possible.",
        type: "policy",
        options: [
          { label: "Contact Support", value: "How can I contact support?" },
          { label: "Track Order", value: "track my order" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(can i change address after order|change address after order|change delivery address after order)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "Address changes are usually possible only before the order is fully processed or dispatched.",
        assistLine: "Please contact support as soon as possible with your order details.",
        type: "policy",
        options: [
          { label: "Contact Support", value: "How can I contact support?" },
          { label: "Track Order", value: "track my order" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(can i cancel my order|cancel my order|cancel order)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "Order cancellation usually depends on whether the order has already been processed or dispatched.",
        assistLine: "Please contact support quickly with your order details so they can guide you properly.",
        type: "policy",
        options: [
          { label: "Contact Support", value: "How can I contact support?" },
          { label: "Track Order", value: "track my order" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(do i need account to order|need account to order|account zaroori hai order ke liye)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "I don't have a confirmed account requirement in the active store details right now.",
        assistLine: "If you want, support can confirm the latest checkout requirement for you.",
        type: "fallback",
        options: [
          { label: "Contact Support", value: "How can I contact support?" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(did not get confirmation|didn't get confirmation|no confirmation|order confirmation nahi mili)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "If you did not receive confirmation, support can help verify whether the order was placed successfully.",
        assistLine: "Please keep your order details or payment reference ready if you have them.",
        type: "fallback",
        options: [
          { label: "Contact Support", value: "How can I contact support?" },
          { label: "Track Order", value: "track my order" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(cash on delivery|cod|cod hai|cash on delivery hai|cash delivery)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "Yes, Cash on Delivery is available across Pakistan.",
        assistLine: "If you want, I can also help with delivery timing or order tracking.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/shipping-policy",
        options: [
          { label: "Track Order", value: "track my order" },
          { label: "Shipping Policy", value: "show shipping and refund policy" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (
      /(same day|same-day)/i.test(userMessage) &&
      /(karachi|karachi mein|karachi me)/i.test(userMessage) &&
      /(advance|advance payment|advance pe|advance pay|paid|prepaid|online payment|pehle payment)/i.test(
        userMessage,
      )
    ) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "Yes, same-day delivery is possible in Karachi with advance payment.",
        assistLine: "Delivery timing can still depend on order confirmation time and area coverage.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/shipping-policy",
        options: [
          { label: "Shipping Policy", value: "show shipping and refund policy" },
          { label: "Track Order", value: "track my order" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(same day delivery|same-day delivery|same day hai|same-day hai)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "Same-day delivery isn't confirmed in the current Snakitos policy details.",
        assistLine: "Delivery usually takes a few business days depending on location.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/shipping-policy",
        options: [
          { label: "Shipping Policy", value: "show shipping and refund policy" },
          { label: "Track Order", value: "track my order" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(online payment secure|payment secure|safe to pay online|secure payment)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "Yes, online payments are handled with standard checkout security.",
        assistLine: "You can also check the official store policies for exact payment details.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/terms-of-service",
        options: [
          { label: "Policies", value: "show shipping and refund policy" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(payment methods|how can i pay|can i pay online|online payment|payment kaise karein|payment kese karain|online pay kar sakte hain)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "You can pay through the standard Snakitos checkout flow, and Cash on Delivery is available too.",
        assistLine: "Online payment details appear during checkout.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/terms-of-service",
        options: [
          { label: "Shipping Policy", value: "show shipping and refund policy" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(deliver all over pakistan|all over pakistan|delivery all over pakistan|pakistan delivery|poore pakistan|saray pakistan|pakistan mein delivery|pakistan me delivery)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "Yes, we deliver all over Pakistan.",
        assistLine: "If you want, I can also help with shipping policy or order tracking.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/shipping-policy",
        options: [
          { label: "Shipping Policy", value: "show shipping and refund policy" },
          { label: "Track Order", value: "track my order" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(fresh|freshness|are your products fresh|fresh hain|fresh hai|taaza hain|taaza hai)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "Yes, our products are packed fresh and carefully checked before dispatch.",
        assistLine: "If you want, I can also help with expiry details for a specific snack.",
        type: "policy",
        options: [
          { label: "Deals", value: "show best deals" },
          { label: "Home", value: "home" },
        ],
      });
    }

    return null;
  }

  private async buildStoreInfoResponse(userMessage: string): Promise<string | null> {
    if (/(what is snakitos|about snakitos|what is your store about|tell me about your brand|brand ke bare mein|brand ke bare me|store ke bare mein|store ke bare me|are you a real store|can i trust this website|official website|ye store real hai|store real hai|real store ho|real hai|what makes your store different|what makes your brand different|who owns this brand)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer:
          "Snakitos is a snack store where you can explore sweet snacks, multigrain bites, banana chips, nachos, bundles, and value deals.",
        assistLine: "If you want, I can show collections or help you pick the best snacks for your mood or budget.",
        type: "fallback",
        options: [
          { label: "Collections", value: "show categories" },
          { label: "Deals", value: "show best deals" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(where are you located|location|physical store|store address|do you have a physical shop|physical shop hai|shop kahan hai|store kahan hai)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "I don't have the latest physical store address in the bot right now.",
        assistLine: "If you want, support can share the latest location details for you.",
        type: "fallback",
        options: [
          { label: "Home", value: "home" },
          { label: "Policies", value: "show shipping and refund policy" },
        ],
      });
    }

    if (/(support hours|contact support|customer support|social media|instagram|facebook|whatsapp|whatsapp number|contact number|support number|support kaise contact karun|support kaise contact karon|support kese contact karun|support kese contact karon)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "You can contact Snakitos support on WhatsApp at +92-345-828-3827.",
        assistLine: "And if you want, I can still help with orders, shipping, refunds, or product picks right here.",
        type: "fallback",
        options: [
          { label: "Track Order", value: "track my order" },
          { label: "Policies", value: "show shipping and refund policy" },
          { label: "Home", value: "home" },
        ],
      });
    }

    return null;
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
      message:
        "I'm here to help with snacks, bundles, order tracking, and delivery details. You can chat in English, Urdu, or Roman Urdu.",
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

  private shouldAskRecommendationFollowUp(message: string): boolean {
    const normalized = message.toLowerCase();
    const isRecommendationRequest =
      /\b(recommend|suggest|something for|best for|movie night|gift|gifting|party|ramzan|eid|office snacks|snacks for)\b/i.test(
        normalized,
      );
    const alreadySpecific =
      /\b(spicy|sweet|mixed|salty|kids|adults|budget|under\s*\d+|rs\.?\s*\d+|imported|banana|nachos|wafer|multigrain|multi grain|family|sharing)\b/i.test(
        normalized,
      );

    return isRecommendationRequest && !alreadySpecific;
  }

  private async buildRecommendationFollowUpResponse(userMessage: string): Promise<string> {
    const isOccasion =
      /\b(movie night|gift|gifting|party|ramzan|eid|office snacks|birthday)\b/i.test(
        userMessage,
      );

    const message = isOccasion
      ? "Happy to help. Before I recommend the best picks, how many people will be sharing, and do you prefer spicy, sweet, or mixed snacks?"
      : "Sure. To recommend the best snacks, tell me your taste preference and budget. For example: spicy under 3000, sweet for gifting, or mixed snacks for 4 people.";

    return this.buildResponseWithSuggestions({
      type: "fallback",
      message,
      userMessage,
      options: [
        { label: "Spicy", value: "Recommend spicy snacks" },
        { label: "Sweet", value: "Recommend sweet snacks" },
        { label: "Mixed", value: "Recommend mixed snacks" },
        { label: "Home", value: "home" },
      ],
      skipSuggestions: true,
    });
  }

  private async buildCuratedProductInfoResponse(userMessage: string): Promise<string | null> {
    const normalized = userMessage.toLowerCase();

    if (/(what flavors|which flavors|flavors are available|flavours are available|kon se flavors hain|kya flavors hain|flavour kya hain)/i.test(normalized)) {
      const products = await this.getFallbackProductRecommendations("popular snack flavors");
      const curated = this.selectProductsForResponse(products, "spicy sweet salty cheesy snacks");
      return this.buildResponseWithSuggestions({
        type: "product",
        message:
          "You can explore spicy, sweet, salty, cheesy, tangy, and chocolatey snack options at Snakitos. Here are a few strong picks to start with.",
        userMessage,
        products: this.buildProductCards(curated, userMessage),
        options: [
          { label: "Spicy", value: "Which snacks are spicy?" },
          { label: "Sweet", value: "What are sweet snacks" },
          { label: "Deals", value: "show best deals" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(which snacks are spicy|spicy snacks|spicy chips|hot snacks|teekhay snacks|teekha snacks|spicy chips chahiye)/i.test(normalized)) {
      const products = await this.getFallbackProductRecommendations("spicy snack best sellers");
      const curated = this.selectProductsForResponse(products, "spicy snacks");
      return this.buildResponseWithSuggestions({
        type: "product",
        message: "If you love spicy snacks, these are strong picks to start with.",
        userMessage,
        products: this.buildProductCards(curated, userMessage),
        options: [
          { label: "Deals", value: "show best deals" },
          { label: "Mixed", value: "Recommend mixed snacks" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(sweet snacks|which snacks are sweet|sweet snack|meethay snacks|meetha snack|sweet chahiye)/i.test(normalized)) {
      const products = await this.getFallbackProductRecommendations("sweet tooth snack deals");
      const curated = this.selectProductsForResponse(products, "sweet snacks");
      return this.buildResponseWithSuggestions({
        type: "product",
        message: "If you're in the mood for sweet snacks, these are a great place to start.",
        userMessage,
        products: this.buildProductCards(curated, userMessage),
        options: [
          { label: "Gift Picks", value: "What is best for gifting?" },
          { label: "Deals", value: "show best deals" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(best sellers|best seller|trending|popular products|best seller dikhao|popular snacks|trending snacks)/i.test(normalized)) {
      const products = await this.getFallbackProductRecommendations("best selling snack deals");
      const curated = this.selectProductsForResponse(products, "best selling snack deals");
      return this.buildResponseWithSuggestions({
        type: "product",
        message: "These are some of the strongest Snakitos picks shoppers usually go for.",
        userMessage,
        products: this.buildProductCards(curated, userMessage),
        options: [
          { label: "Deals", value: "show best deals" },
          { label: "Gift Picks", value: "What is best for gifting?" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(suitable for kids|for kids|kids snacks|bachon ke liye snacks|kids ke liye snacks)/i.test(normalized)) {
      const products = await this.getFallbackProductRecommendations("sweet mild snacks for kids");
      const curated = this.selectProductsForResponse(products, "sweet mild snacks");
      return this.buildResponseWithSuggestions({
        type: "product",
        message:
          "For kids, milder and sweeter snack options are usually the safest place to start. Here are a few snack ideas you can explore.",
        userMessage,
        products: this.buildProductCards(curated, userMessage),
        options: [
          { label: "Sweet", value: "What are sweet snacks" },
          { label: "Deals", value: "show best deals" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (
      /\b(all|every|full|complete)\b/i.test(normalized) &&
      /\b(weight|weights|size|sizes|wazan|kitna gram|kitne gram|grams?|pack size|pack sizes|specification|specifications)\b/i.test(
        normalized,
      )
    ) {
      return await this.buildAllWeightSpecificationsResponse(userMessage);
    }

    if (
      /\b(weight|weights|size|sizes|wazan|kitna gram|kitne gram|grams?|pack size|pack sizes)\b/i.test(
        normalized,
      ) &&
      !this.hasSpecificProductDetailTarget(userMessage)
    ) {
      return this.buildResponseWithSuggestions({
        type: "fallback",
        message:
          "I can check the exact pack size for a specific item. Just send the product name, like Coco Choco, Banana Chips, or Multigrain Stix.",
        userMessage,
        options: [
          { label: "Coco Choco", value: "What is the weight of Coco Choco?" },
          { label: "Banana Chips", value: "What is the weight of Banana Chips?" },
          { label: "Home", value: "home" },
        ],
        skipSuggestions: true,
      });
    }

    if (
      /(halal certificate|certificate|certification|certificate chahiye|certificate chaiye|certificate do|halal|halaal|halal hain|halal hai|vegetarian|vegan|ingredients|ingredients kya hain|expiry duration|expiry|expiry details|expiry kitni hai|imported or local|imported|local)/i.test(
        normalized,
      ) &&
      !this.hasSpecificProductDetailTarget(userMessage)
    ) {
      return this.buildResponseWithSuggestions({
        type: "fallback",
        message: this.buildGeneralProductDetailAnswer(normalized),
        userMessage,
        options: [
          { label: "Banana Chips", value: "Show me Banana Chips" },
          { label: "Multi Grain", value: "Show me Multi Grain snacks" },
          { label: "Home", value: "home" },
        ],
        skipSuggestions: true,
      });
    }

    return null;
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
      products: [],
      options: [
        { label: "Back", value: "show categories" },
        { label: "Home", value: "home" },
      ],
      skipSuggestions: true,
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
      const crispDescription = this.extractDirectProductDescription(bestMatch, userMessage);
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
      ? "Here is the quick policy update from Snakitos."
      : "Here is what I found for you.";

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

  private async buildGeneralPlaybookResponse(input: {
    userMessage: string;
    answer: string;
    assistLine?: string;
    type: "fallback" | "policy" | "product" | "mixed";
    policyLink?: string;
    options: Array<{ label: string; value: string }>;
  }): Promise<string> {
    const message = [input.answer.trim(), input.assistLine?.trim()].filter(Boolean).join("\n\n");

    return this.buildResponseWithSuggestions({
      type: input.type,
      message,
      userMessage: input.userMessage,
      policyLink: input.policyLink,
      options: input.options,
      skipSuggestions: true,
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
    if (!resolvedQuery || products.length === 0) {
      return false;
    }

    const asksForFacts = /\b(are|is|do|does|did|can|could|would|will|what|which|how|why|ingredient|ingredients|made of|made from|fried|dried|baked|vegan|vegetarian|halal|halaal|gluten|spicy|sweet|salty|flavour|flavor|weight|wazan|size|fresh|expiry|kitna|kitni)\b/i.test(
      userMessage,
    );

    const asksForDiscovery = /\b(best|top|recommend|suggest|deal|bundle|combo|gift|party|movie night|sharing|for kids|for adults|under\s*\d+|rs\.?\s*\d+)\b/i.test(
      userMessage,
    );

    return asksForFacts && !asksForDiscovery;
  }

  private extractDirectProductDescription(
    product: ProductLookupResult,
    userMessage: string,
  ): string {
    const normalizedMessage = userMessage.toLowerCase();
    const weightMatch = this.extractProductWeight(product);
    const metadata = this.getProductMetadata(product);
    const productDescription = this.getMeaningfulProductDescription(product);

    if (/\b(weight|wazan|size|how much|kitna|gram|grams|g)\b/i.test(normalizedMessage) && weightMatch) {
      return productDescription
        ? `${productDescription} ${product.title} comes in ${weightMatch}.`
        : `${product.title} comes in ${weightMatch}.`;
    }

    if (/\b(certificate|certification|halal certificate|certificate chahiye|certificate chaiye|certificate do)\b/i.test(normalizedMessage)) {
      if (metadata.halalCertificateMessage) {
        return productDescription
          ? `${productDescription} ${metadata.halalCertificateMessage}`
          : metadata.halalCertificateMessage;
      }
    }

    if (/\b(halal|halaal)\b/i.test(normalizedMessage)) {
      if (typeof metadata.halal === "boolean") {
        return metadata.halal
          ? productDescription
            ? `${productDescription} Yes, ${product.title} is halal and approved by Pakistan Halal Authority (PHA) and Sindh. If you need the halal certificate, our support team can share it on request.`
            : `Yes, ${product.title} is halal and approved by Pakistan Halal Authority (PHA) and Sindh. If you need the halal certificate, our support team can share it on request.`
          : `${product.title} is not marked as halal in the current product details.`;
      }

      return `I found ${product.title}, but the current catalog does not explicitly confirm halal status. Please check the product page or ask support for exact confirmation.`;
    }

    if (/\b(vegetarian|vegan)\b/i.test(normalizedMessage)) {
      return `I found ${product.title}, but the current catalog does not explicitly confirm whether it is vegetarian or vegan. Please check the product page or ask support for exact confirmation.`;
    }

    if (/\b(ingredients?|made of|made from|ingredients kya hain)\b/i.test(normalizedMessage)) {
      if (metadata.ingredientsSummary) {
        return productDescription
          ? `${productDescription} It is usually made with ${metadata.ingredientsSummary.toLowerCase()}`
          : `${product.title} is usually made with ${metadata.ingredientsSummary.toLowerCase()}`;
      }

      if (productDescription) {
        return `${productDescription} The product description does not list the full ingredients clearly, so please check the product page or ask support for the exact ingredient list.`;
      }

      return `I found ${product.title}, but the current catalog does not list the full ingredients clearly here. Please open the product page or ask support for the exact ingredient list.`;
    }

    if (/\b(expiry|shelf life|fresh|expiry kitni|kitni expiry)\b/i.test(normalizedMessage)) {
      if (metadata.expiry) {
        return productDescription
          ? `${productDescription} ${product.title} usually has an expiry of ${metadata.expiry}.`
          : `${product.title} usually has an expiry of ${metadata.expiry}.`;
      }

      return `I found ${product.title}, but the current catalog does not clearly confirm the exact expiry or shelf-life details here. Please check the product page or ask support for exact confirmation.`;
    }

    if (/\b(fried|dried|baked)\b/i.test(normalizedMessage)) {
      if (productDescription) {
        return `${productDescription} The product description does not explicitly confirm whether it is fried, dried, or baked.`;
      }

      return `I found ${product.title}, but the current catalog does not explicitly confirm whether it is fried, dried, or baked. Please check the product page or ask support for exact confirmation.`;
    }

    if (productDescription) {
      return productDescription;
    }

    if (product.productType) {
      return `${product.title} is listed as a ${product.productType} snack on Snakitos.`;
    }

    return `${product.title} is listed on the Snakitos store, but the catalog does not include more detailed product notes.`;
  }

  private hasSpecificProductDetailTarget(userMessage: string): boolean {
    const candidate = extractProductQuery(userMessage)
      .toLowerCase()
      .replace(
        /\b(what|which|is|are|the|of|for|a|an|do|does|can|you|your|show|list|tell|me|all|every|full|complete|hai|hain|kya|kiya|ka|ki|ke|mein|me|wali|wala|walay|chahiye|chaiye|do|dein|dena|product|products|snack|snacks|item|items|weight|weights|wazan|size|sizes|specification|specifications|pack|packs|gram|grams|g|kg|ml|l|halal|halaal|certificate|certification|vegetarian|vegan|ingredients?|expiry|duration|details|fresh|imported|local|fried|dried|baked|made|from|made of|made from|status)\b/g,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim();

    return candidate.split(" ").filter(Boolean).length >= 1;
  }

  private async buildAllWeightSpecificationsResponse(userMessage: string): Promise<string> {
    const products = await this.getFallbackProductRecommendations("store snack catalog");
    const weightedProducts = this.selectProductsForResponse(
      products.filter((product) => this.extractProductWeight(product)),
      userMessage,
    ).slice(0, 6);

    const weights = Array.from(
      new Set(
        weightedProducts
          .map((product) => this.extractProductWeight(product))
          .filter((weight): weight is string => Boolean(weight)),
      ),
    );

    const weightSummary =
      weights.length > 0
        ? `Common pack sizes I found in the current catalog include ${weights.join(", ")}.`
        : "I found product pack sizes in the catalog, but not for every item.";

    return this.buildResponseWithSuggestions({
      type: "product",
      message: `${weightSummary} Here are a few product examples with their weights.`,
      userMessage,
      products: this.buildProductCards(weightedProducts, userMessage),
      options: [
        { label: "Coco Choco", value: "What is the weight of Coco Choco?" },
        { label: "Banana Chips", value: "What is the weight of Banana Chips?" },
        { label: "Home", value: "home" },
      ],
      skipSuggestions: true,
    });
  }

  private extractProductWeight(product: ProductLookupResult): string | null {
    const titleWeightMatch = product.title.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
    if (titleWeightMatch) {
      return `${titleWeightMatch[1]}${titleWeightMatch[2].toLowerCase()}`;
    }

    const descriptionWeightMatch = product.description?.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
    if (descriptionWeightMatch) {
      return `${descriptionWeightMatch[1]}${descriptionWeightMatch[2].toLowerCase()}`;
    }

    return null;
  }

  private getMeaningfulProductDescription(product: ProductLookupResult): string | null {
    const description = (product.description ?? "").trim();
    if (!description || description === "Snakitos snack from uploaded catalog.") {
      return null;
    }

    return /[.!?]$/.test(description) ? description : `${description}.`;
  }

  private buildGeneralProductDetailAnswer(normalizedMessage: string): string {
    if (/\b(certificate|certification|halal certificate|certificate chahiye|certificate chaiye|certificate do)\b/i.test(normalizedMessage)) {
      return "Yes, our products are halal and approved by Pakistan Halal Authority (PHA) and Sindh. If you need the halal certificate, our support team can share it on request.";
    }

    if (/\b(halal|halaal|halal hain|halal hai)\b/i.test(normalizedMessage)) {
      return "Yes, our products are halal and approved by Pakistan Halal Authority (PHA) and Sindh. If you need the halal certificate, our support team can share it on request.";
    }

    if (/\b(vegetarian|vegan)\b/i.test(normalizedMessage)) {
      return "I can help check a specific snack, but the current catalog does not clearly confirm vegetarian or vegan status across all items. Share the product name and I'll narrow it down for you.";
    }

    if (/\b(ingredients?|ingredients kya hain)\b/i.test(normalizedMessage)) {
      return "Ingredients vary by snack. Common bases include corn, potato, banana, multigrain blends, chickpea, wafer, and chocolate fillings. Share a product name and I'll narrow it down for you.";
    }

    if (/\b(expiry duration|expiry|expiry kitni hai|kitni expiry)\b/i.test(normalizedMessage)) {
      return "Banana Chips usually have an expiry of 3 months. Most remaining Snakitos products usually have an expiry of 1 year.";
    }

    if (/\b(imported or local|imported|local)\b/i.test(normalizedMessage)) {
      return "I can help check a specific snack, but the current catalog does not clearly label every item as imported or local. Share the product name and I'll narrow it down for you.";
    }

    return "I can help check a specific product, but the current catalog does not explicitly confirm that detail across all items. Share the product name and I'll narrow it down for you.";
  }

  private getProductMetadata(product: ProductLookupResult): {
    halal?: boolean;
    halalCertificate?: string;
    halalCertificateMessage?: string;
    expiry?: string;
    ingredientsSummary?: string;
  } {
    const title = `${product.title} ${product.productType ?? ""}`.toLowerCase();
    const rules = (productMetadata.rules ?? []) as ProductMetadataRule[];
    const matchedRule = rules.find((rule) =>
      rule.matchAny.some((keyword) => title.includes(keyword.toLowerCase())),
    );

    return {
      halal: matchedRule?.halal ?? productMetadata.defaults?.halal,
      halalCertificate: matchedRule?.halalCertificate ?? productMetadata.defaults?.halalCertificate,
      halalCertificateMessage:
        matchedRule?.halalCertificateMessage ?? productMetadata.defaults?.halalCertificateMessage,
      expiry: matchedRule?.expiry ?? productMetadata.defaults?.expiry,
      ingredientsSummary:
        matchedRule?.ingredientsSummary ?? productMetadata.defaults?.ingredientsSummary,
    };
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
      .replace(/^for questions like ['"].+?['"], use the .+? policy\.\s*/i, "")
      .replace(/^the chatbot should .+? instead of guessing\.\s*/i, "")
      .replace(new RegExp(`^${this.escapeRegExp(fallbackName)}\\s+(?:is|explains|contains)\\s+`, "i"), "")
      .replace(/^this\s+/i, "")
      .replace(/\s*if the customer needs a specific order update.+$/i, "")
      .replace(/\s*if the information is not confirmed in the knowledge base.+$/i, "")
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
