import { config } from "../config";
import {
  AgentContext,
  AgentIntent,
  ChatRequestInput,
  ChatResponsePayload,
} from "../types/chat.types";
import { ProductLookupResult } from "../types/order.types";
import { detectIntent } from "../utils/intent.util";
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
          "I can help with products, orders, shipping, and store policies, but I can’t provide internal system or security information.";
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
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    if (intent === "order") {
      return this.handleOrderIntent(intentResult, userMessage);
    }

    if (intent === "product") {
      return this.handleProductIntent(userMessage, chatId);
    }

    return this.handleGeneralIntent(userMessage, chatId);
  }

  private isSensitiveRequest(message: string): boolean {
    return /(api key|access token|secret key|client secret|password|prompt|system prompt|hidden instruction|ignore previous instructions|developer message|env file|environment variable|process\.env|shopify_admin_api_access_token|openai_api_key|supabase_service_role_key)/i.test(
      message,
    );
  }

  private resolveIntentWithConversationContext(
    message: string,
    phone: string | undefined,
    recentMessages: Array<{ role: "user" | "bot"; content: string }>,
  ): ReturnType<typeof detectIntent> {
    const current = detectIntent(message, phone);
    if (current.intent === "order" && current.orderId && current.phone) {
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

        if (!acc.intentIsOrder && detected.intent === "order") {
          acc.intentIsOrder = true;
        }

        return acc;
      },
      {
        orderId: "",
        phone: "",
        intentIsOrder: false,
      },
    );

    if (
      current.intent === "order" ||
      previousOrderContext.intentIsOrder ||
      Boolean(current.orderId || current.phone)
    ) {
      return {
        intent: "order",
        orderId: current.orderId || previousOrderContext.orderId,
        phone: current.phone || previousOrderContext.phone,
      };
    }

    return current;
  }

  private async handleOrderIntent(
    intentResult: ReturnType<typeof detectIntent>,
    userMessage: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    if (!intentResult.orderId || !intentResult.phone) {
      const missingFields = [
        !intentResult.orderId ? "order ID" : null,
        !intentResult.phone ? "phone number" : null,
      ].filter(Boolean);

      return {
        intent: "order",
        response: formatWhatsAppFallback(
          `Please share your ${missingFields.join(" and ")} so I can track your order.`,
        ),
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
        response: formatWhatsAppFallback(
          "I could not access the order system right now.",
        ),
      };
    }

    if (!order) {
      await supabaseService.logEvent("order_verification_failed", {
        orderId: intentResult.orderId,
      });

      return {
        intent: "order",
        response: formatWhatsAppFallback(
          "Sorry, we could not verify your order details.",
        ),
      };
    }

    const context: AgentContext = {
      order: {
        orderName: order.orderName,
        orderNumber: order.orderNumber,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        createdAt: order.createdAt,
        tracking: order.tracking,
        lineItems: order.lineItems,
      },
    };

    const response = await aiService.generateResponse({
      intent: "order",
      userMessage,
      context,
    });

    return {
      intent: "order",
      response,
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

      if ((products.length === 0 && isStoreBrowsingQuestion) || (!productQuery && !referencedProduct)) {
        products = await shopifyService.getStorefrontRecommendations(
          referencedProduct || productQuery || userMessage,
          5,
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
        return {
          intent: "product",
          response: this.buildStorefrontRecommendationResponse(userMessage, fallbackProducts),
          data: fallbackProducts,
        };
      }

      return {
        intent: "product",
        response: formatWhatsAppFallback(
          "I could not access the product catalog right now.",
        ),
      };
    }

    if (products.length === 0) {
      const fallbackProducts = await this.getFallbackProductRecommendations(
        referencedProduct || productQuery || userMessage,
      );
      if (fallbackProducts.length > 0) {
        return {
          intent: "product",
          response: this.buildStorefrontRecommendationResponse(userMessage, fallbackProducts),
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

    if (isStoreBrowsingQuestion) {
      return {
        intent: "product",
        response: this.buildStorefrontRecommendationResponse(userMessage, products),
        data: products,
      };
    }

    return {
      intent: "product",
      response: this.buildProductResponse(products),
      data: products,
    };
  }

  private buildStorefrontRecommendationResponse(
    userMessage: string,
    products: Array<{
      title: string;
      price: string | null;
    }>,
  ): string {
    const lowered = userMessage.toLowerCase();
    let intro = "Here are some Snakitos products I found:";

    if (/(deal|deals|bundle|combo|offer)/i.test(lowered)) {
      intro = "Here are some Snakitos deals and bundles I found:";
    } else if (/(gift|gifts|relative|friend|family gift|birthday|present)/i.test(lowered)) {
      intro = "These Snakitos options look like strong gift picks from the store right now:";
    } else if (/(best|selling|seller|popular|featured)/i.test(lowered)) {
      intro =
        "Here are some strong featured Snakitos options from the store right now:";
    } else if (/(night|craving|late night)/i.test(lowered)) {
      intro = "For late-night cravings, these Snakitos picks should hit the spot:";
    } else if (/(tea|evening|midnight|hungry|munch|munchies)/i.test(lowered)) {
      intro = "These Snakitos snacks look like a good match for that craving:";
    } else if (/(sweet|salty|spicy|crispy|crunchy|cheesy|chocolate|choco)/i.test(lowered)) {
      intro = "Here are some Snakitos picks that match that flavor craving:";
    } else if (/(movie|party|sharing|family)/i.test(lowered)) {
      intro = "For movie time or sharing, these Snakitos options look like a good fit:";
    } else if (/(rate|price|prices)/i.test(lowered)) {
      intro = "Here are some current Snakitos product prices:";
    }

    const lines = products.slice(0, 5).map((product, index) => {
      const price = product.price ? `PKR ${product.price}` : "Price not listed";
      return `${index + 1}. ${product.title} - ${price}`;
    });

    return `${intro}\n${lines.join("\n")}\nIf you want, I can also suggest deals, nachos, or movie-night snacks.`;
  }

  private async getFallbackProductRecommendations(query: string): Promise<ProductLookupResult[]> {
    try {
      return await shopifyService.getStorefrontRecommendations(query, 5);
    } catch {
      return [];
    }
  }

  private buildProductResponse(
    products: Array<{
      title: string;
      price: string | null;
      availability: "in_stock" | "out_of_stock" | "unknown";
      productType?: string | null;
      vendor?: string | null;
      tags?: string[];
      description?: string | null;
      orderCount?: number | null;
      unitsSold?: number | null;
    }>,
  ): string {
    if (products.length === 1) {
      const [product] = products;
      const details = [
        `Product: ${product.title}`,
        product.price ? `Price: PKR ${product.price}` : null,
        product.description ? `Details: ${product.description.slice(0, 240)}` : null,
      ].filter(Boolean);

      return `${details.join("\n")}\nIf you want, I can also suggest similar Snakitos products.`;
    }

    const lines = products.slice(0, 5).map((product, index) => {
      const parts = [
        `${index + 1}. ${product.title}`,
        product.price ? `PKR ${product.price}` : "Price not listed",
      ];

      return parts.join(" - ");
    });

    return `Here are the closest Snakitos products I found:\n${lines.join("\n")}\nReply with the product name or number if you want more details about one item.`;
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

  private async handleGeneralIntent(
    userMessage: string,
    chatId: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    const [knowledge, recentMessages] = await Promise.all([
      knowledgeService.retrieve(userMessage),
      supabaseService.getRecentMessages(chatId),
    ]);

    const response = await aiService.generateResponse({
      intent: "general",
      userMessage,
      context: {
        knowledge,
        recentMessages,
        policies: {
          whatsappSupport: config.app.whatsappNumber,
        },
      },
    });

    return {
      intent: "general",
      response,
      data: knowledge,
    };
  }
}

export const supportAgentService = new SupportAgentService();
