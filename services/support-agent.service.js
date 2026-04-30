import { config } from "../config";
import { detectIntent } from "../utils/intent.util";
import { extractProductQuery, formatWhatsAppFallback, normalizePhone, } from "../utils/validation.util";
import { aiService } from "./ai.service";
import { knowledgeService } from "./knowledge.service";
import { shopifyService } from "./shopify.service";
import { supabaseService } from "./supabase.service";
export class SupportAgentService {
    async handleChat(input) {
        const userId = await supabaseService.upsertUser({
            id: input.userId,
            email: input.email,
            phone: normalizePhone(input.phone),
        });
        const chatId = await supabaseService.getOrCreateChat(userId, input.chatId);
        await supabaseService.addMessage(chatId, "user", input.message);
        try {
            const intentResult = detectIntent(input.message, input.phone);
            const response = await this.routeIntent(intentResult.intent, intentResult, input.message, chatId);
            await supabaseService.addMessage(chatId, "bot", response.response);
            await supabaseService.logEvent("chat_processed", {
                chatId,
                userId,
                intent: response.intent,
            });
            return {
                ...response,
                chatId,
                userId,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown chat error";
            await supabaseService.logEvent("chat_error", {
                chatId,
                userId,
                error: errorMessage,
            });
            const response = formatWhatsAppFallback("We are having trouble processing your request right now.");
            await supabaseService.addMessage(chatId, "bot", response);
            return {
                response,
                intent: "general",
                chatId,
                userId,
            };
        }
    }
    async routeIntent(intent, intentResult, userMessage, chatId) {
        if (intent === "order") {
            return this.handleOrderIntent(intentResult, userMessage);
        }
        if (intent === "product") {
            return this.handleProductIntent(userMessage, chatId);
        }
        return this.handleGeneralIntent(userMessage, chatId);
    }
    async handleOrderIntent(intentResult, userMessage) {
        if (!intentResult.orderId || !intentResult.phone) {
            const missingFields = [
                !intentResult.orderId ? "order ID" : null,
                !intentResult.phone ? "phone number" : null,
            ].filter(Boolean);
            return {
                intent: "order",
                response: formatWhatsAppFallback(`Please share your ${missingFields.join(" and ")} so I can track your order.`),
            };
        }
        let order;
        try {
            order = await shopifyService.getVerifiedOrder(intentResult.orderId, intentResult.phone);
        }
        catch (error) {
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
            await supabaseService.logEvent("order_verification_failed", {
                orderId: intentResult.orderId,
            });
            return {
                intent: "order",
                response: formatWhatsAppFallback("Sorry, we could not verify your order details."),
            };
        }
        const context = {
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
    async handleProductIntent(userMessage, chatId) {
        const productQuery = extractProductQuery(userMessage);
        if (!productQuery) {
            return {
                intent: "product",
                response: "Please tell me which product you want to know about.",
            };
        }
        let products;
        try {
            products = await shopifyService.searchProducts(productQuery);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Product lookup failed";
            await supabaseService.logEvent("product_lookup_error", {
                query: productQuery,
                chatId,
                error: errorMessage,
            });
            return {
                intent: "product",
                response: formatWhatsAppFallback("I could not access the product catalog right now."),
            };
        }
        if (products.length === 0) {
            await supabaseService.logEvent("product_not_found", {
                query: productQuery,
                chatId,
            });
            return {
                intent: "product",
                response: formatWhatsAppFallback(`I could not find a product matching "${productQuery}".`),
            };
        }
        const response = await aiService.generateResponse({
            intent: "product",
            userMessage,
            context: {
                products,
            },
        });
        return {
            intent: "product",
            response,
            data: products,
        };
    }
    async handleGeneralIntent(userMessage, chatId) {
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
