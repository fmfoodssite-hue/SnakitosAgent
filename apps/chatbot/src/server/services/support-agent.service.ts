import policyData from "../data/policies.json";
import productMetadata from "../data/product-metadata.json";
import trainingGuideReference from "../data/snakitos-training-guide-reference.json";
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

type ConversationState = {
  last_intent: string;
  last_topic: string;
  pending_action: string;
  last_category: string;
  last_budget: string;
  last_taste: string;
  last_occasion: string;
  last_recommended_products: string[];
  last_policy_topic: string;
  last_support_issue: string;
};

type SnakitosIntent =
  | "greeting"
  | "what_do_you_sell"
  | "general_brand_query"
  | "main_categories"
  | "new_customer_query"
  | "budget_prompt"
  | "product_navigation_prompt"
  | "best_seller_query"
  | "support_request"
  | "fallback_unknown"
  | "product_category_query"
  | "product_specific_query"
  | "product_recommendation"
  | "spicy_recommendation"
  | "sweet_recommendation"
  | "mixed_recommendation"
  | "salty_recommendation"
  | "mild_recommendation"
  | "crunchy_recommendation"
  | "kids_recommendation"
  | "office_recommendation"
  | "movie_night_recommendation"
  | "gifting_recommendation"
  | "party_recommendation"
  | "tea_time_recommendation"
  | "gaming_netflix_recommendation"
  | "budget_recommendation"
  | "product_availability"
  | "product_restock"
  | "product_storage"
  | "product_freshness"
  | "price_objection"
  | "halal_query"
  | "certification_query"
  | "ingredient_query"
  | "allergen_query"
  | "vegan_vegetarian_query"
  | "spice_level_query"
  | "nutrition_query"
  | "best_deals"
  | "bundle_deals"
  | "discount_query"
  | "coupon_not_working"
  | "free_shipping_query"
  | "cart_completion"
  | "confused_customer"
  | "repeat_purchase"
  | "upsell_request"
  | "cross_sell_request"
  | "shipping_policy"
  | "shipping_refund_policy"
  | "delivery_charges"
  | "delivery_time"
  | "delivery_city"
  | "same_day_delivery"
  | "address_change"
  | "delayed_order"
  | "cod_query"
  | "online_payment"
  | "whatsapp_order"
  | "payment_failed"
  | "secure_payment"
  | "return_request"
  | "refund_request"
  | "refund_time"
  | "replacement_request"
  | "damaged_product"
  | "wrong_product"
  | "exchange_flavor"
  | "cancellation_query"
  | "wholesale_query"
  | "bulk_discount"
  | "corporate_gifting"
  | "event_order"
  | "order_tracking"
  | "confirmation_continue"
  | "back_home";

type ClassifiedIntent = {
  intent: SnakitosIntent;
  language: "english" | "roman_urdu" | "mixed";
  budget?: string;
  category?: string;
  productName?: string;
  taste?: string;
  occasion?: string;
};

const DEFAULT_CONVERSATION_STATE: ConversationState = {
  last_intent: "",
  last_topic: "",
  pending_action: "",
  last_category: "",
  last_budget: "",
  last_taste: "",
  last_occasion: "",
  last_recommended_products: [],
  last_policy_topic: "",
  last_support_issue: "",
};

const conversationStateStore = new Map<string, ConversationState>();
const FREE_SHIPPING_THRESHOLD =
  Number((trainingGuideReference as { conversion_rules?: { free_shipping_threshold?: number } })
    .conversion_rules?.free_shipping_threshold) || 2500;

export class SupportAgentService {
  async handleChat(input: ChatRequestInput): Promise<ChatResponsePayload> {
    const startedAt = Date.now();
    const normalizedPhone = normalizePhone(input.phone);
    const session = await this.resolveChatSession(input);
    const { chatId, userId } = session;
    const conversationState = this.getConversationState(chatId, userId);

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

      const response =
        (await this.routeStructuredIntent(
          input.message,
          chatId,
          userId,
          input.clientKey,
          conversationState,
          intentResult,
        )) ??
        (await this.routeIntent(
          intentResult.intent,
          intentResult,
          input.message,
          chatId,
          input.clientKey,
        ));
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

  private getConversationState(chatId: string, userId: string): ConversationState {
    const key = this.getConversationStateKey(chatId, userId);
    const existing = conversationStateStore.get(key);
    if (existing) {
      return existing;
    }

    const next = { ...DEFAULT_CONVERSATION_STATE };
    conversationStateStore.set(key, next);
    return next;
  }

  private saveConversationState(
    chatId: string,
    userId: string,
    updates: Partial<ConversationState>,
  ): ConversationState {
    const key = this.getConversationStateKey(chatId, userId);
    const next = {
      ...this.getConversationState(chatId, userId),
      ...updates,
    };
    conversationStateStore.set(key, next);
    return next;
  }

  private getConversationStateKey(chatId: string, userId: string): string {
    if (userId) {
      return `user::${userId}`;
    }

    return `chat::${chatId || "guest"}`;
  }

  private async routeStructuredIntent(
    userMessage: string,
    chatId: string,
    userId: string,
    clientKey: string | undefined,
    state: ConversationState,
    orderIntentResult: ReturnType<typeof detectIntent>,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId"> | null> {
    const classified = this.classifySnakitosIntent(userMessage, state);

    const supportIssueFollowUp = await this.handleSupportIssueFollowUp(
      state,
      userMessage,
      orderIntentResult,
      classified,
    );
    if (supportIssueFollowUp) {
      this.saveConversationState(chatId, userId, {
        last_intent: classified.intent === "fallback_unknown" ? state.last_intent : classified.intent,
        last_topic: state.last_support_issue || state.last_topic,
        pending_action: "",
      });
      return supportIssueFollowUp;
    }

    if (classified.intent === "fallback_unknown") {
      return null;
    }

    if (classified.intent === "order_tracking") {
      const orderResult =
        orderIntentResult.intent === "order"
          ? orderIntentResult
          : detectIntent(userMessage, "");
      const response = await this.handleOrderIntent(orderResult, userMessage, clientKey);
      this.saveConversationState(chatId, userId, {
        last_intent: classified.intent,
        last_topic: "order_tracking",
        pending_action: "",
      });
      return response;
    }

    const response = await this.handleSnakitosStructuredIntent(classified, userMessage, chatId);
    if (!response) {
      return null;
    }

    this.saveConversationState(chatId, userId, this.buildStateUpdateFromIntent(classified, response));
    return response;
  }

  private async handleSupportIssueFollowUp(
    state: ConversationState,
    userMessage: string,
    orderIntentResult: ReturnType<typeof detectIntent>,
    classified: ClassifiedIntent,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId"> | null> {
    if (
      !["damaged_product", "wrong_product", "payment_failed", "support_request"].includes(
        state.last_support_issue,
      )
    ) {
      return null;
    }

    if (
      classified.intent !== "fallback_unknown" &&
      classified.intent !== "order_tracking" &&
      classified.intent !== "support_request"
    ) {
      return null;
    }

    if (/\b(track my order|where is my order|order status|tracking number|parcel track|order kab ayega)\b/i.test(userMessage)) {
      return null;
    }

    const hasOrderReference = Boolean(orderIntentResult.orderId || orderIntentResult.phone);
    const hasProofReference = /\b(photo|photos|video|videos|picture|pictures|pic|pics|screenshot|proof)\b/i.test(
      userMessage,
    );

    if (!hasOrderReference && !hasProofReference) {
      return null;
    }

    const message = this.buildSupportIssueFollowUpMessage(
      state.last_support_issue,
      orderIntentResult,
      hasProofReference,
    );

    return {
      intent: "general",
      response: await this.buildResponseWithSuggestions({
        type: "fallback",
        message,
        userMessage,
        options: [
          { label: "WhatsApp Support", value: "How can I contact support?" },
          { label: "Home", value: "home" },
        ],
        skipSuggestions: true,
      }),
    };
  }

  private buildSupportIssueFollowUpMessage(
    supportIssue: string,
    orderIntentResult: ReturnType<typeof detectIntent>,
    hasProofReference: boolean,
  ): string {
    const hasOrderReference = Boolean(orderIntentResult.orderId || orderIntentResult.phone);

    if (supportIssue === "payment_failed") {
      if (hasOrderReference) {
        return "Thanks. I’ve noted your order details. Please also share your payment screenshot or transaction ID with support so they can verify the failed payment properly.";
      }

      return "Thanks. Please also share your order number or checkout phone number, along with any payment screenshot or transaction ID, so support can verify the issue properly.";
    }

    if (supportIssue === "wrong_product") {
      if (hasOrderReference && hasProofReference) {
        return "Thanks. I’ve noted your order details. Please send the photo of the product received and the packaging to support so they can review the replacement or correction quickly.";
      }

      if (hasOrderReference) {
        return "Thanks. I’ve noted your order details. Please also share a clear photo of the product received and the packaging so support can review the issue quickly.";
      }

      return "Thanks. Please also share your order number or checkout phone number, along with a clear photo of the product received and the packaging, so support can review the issue quickly.";
    }

    if (supportIssue === "damaged_product") {
      if (hasOrderReference && hasProofReference) {
        return "Thanks. I’ve noted your order details. Please send the photos or videos of the damaged items and packaging to support so they can review your claim quickly.";
      }

      if (hasOrderReference) {
        return "Thanks. I’ve noted your order details. Please also share clear photos or videos of the damaged items and packaging so support can review your claim quickly.";
      }

      return "Thanks. Please also share your order number or checkout phone number, along with clear photos or videos of the damaged items and packaging, so support can review your claim quickly.";
    }

    if (hasOrderReference) {
      return "Thanks. I’ve noted your details. Please share the remaining issue details with support so they can help you faster.";
    }

    return "Thanks. Please share a little more detail and contact support so they can guide you properly.";
  }

  private classifySnakitosIntent(
    userMessage: string,
    state: ConversationState,
  ): ClassifiedIntent {
    const normalized = this.normalizeSnakitosMessage(userMessage);
    const language = this.detectSnakitosLanguage(userMessage);
    const budgetMatch =
      userMessage.match(/(?:under|below|andar|rs\.?|pkr)\s*(\d{3,5})/i) ??
      userMessage.match(/\b(\d{3,5})\s*(?:ke\s+andar|mein|me|under)\b/i);
    const isBudgetFollowUp =
      state.pending_action === "show_more_products" ||
      state.last_intent === "best_deals" ||
      state.last_intent === "bundle_deals" ||
      state.last_intent === "budget_recommendation" ||
      state.last_intent.endsWith("_recommendation");
    const bareBudgetMatch = isBudgetFollowUp ? normalized.match(/^(\d{3,5})$/) : null;
    const budget = budgetMatch?.[1] ?? bareBudgetMatch?.[1] ?? "";
    const category = this.extractKnownCategory(userMessage);

    if (/^(back|home|take me back|main categories|show categories)$/i.test(normalized)) {
      return { intent: "back_home", language };
    }

    if (
      /^(sure|yes|ok|okay|continue|show me|han|haan|acha|theek|yes please)$/i.test(normalized) &&
      state.pending_action
    ) {
      return { intent: "confirmation_continue", language };
    }

    if (/^(hi|hello|hey|assalamualaikum|salam|kya haal|help)$/i.test(normalized)) {
      return { intent: "greeting", language };
    }

    if (/(where is my order|track my order|mera order kahan hai|order kahan hai|track order|parcel kab ayega|order kab milega|mujhy tracking do|tracking do|tracking kidar hai|track$|tracker number|email tracking nahi aya|parcel late|rider kidar hai|order$|mera order|ordar no nahi hai|phone se order dekho|order id bhool gaya|courier update nhi|status batao|3 din hogaye order nahi aya|kal order kia tha)/i.test(normalized)) {
      return { intent: "order_tracking", language };
    }

    if (/(talk to agent|human support|talk to support|support chahiye|agent se baat|whatsapp support|koi agent se bat krni)/i.test(normalized)) {
      return { intent: "support_request", language };
    }

    if (/(shipping and refund policy|shipping refund policy|shipping & refund)/i.test(normalized)) {
      return { intent: "shipping_refund_policy", language };
    }

    if (/(what do you sell|what snacks do you have|what products are available)/i.test(normalized)) {
      return { intent: "what_do_you_sell", language };
    }

    if (/(new customer|first time|pehli dafa|first order|i'm new here|im new here)/i.test(normalized)) {
      return { intent: "new_customer_query", language };
    }

    if (/(what'?s your budget|what is your budget|budget\?)/i.test(normalized)) {
      return { intent: "budget_prompt", language };
    }

    if (/(best sellers|best seller|popular snacks|popular items)/i.test(normalized)) {
      return { intent: "best_seller_query", language };
    }

    if (/(show me best deals|best deals|snack deals|best value|bundles|deals available|combo deals|value packs)/i.test(normalized)) {
      return { intent: "best_deals", language };
    }

    if (/(recommend something|what should i buy|suggest snacks|recommend me)/i.test(normalized)) {
      return { intent: "product_recommendation", language };
    }

    if (/(spicy snacks|spicy snack|bhai spicy snacks batao|teekha|teekay|spicy combo|bohat teekha|hot spicy|spcy snacks)/i.test(normalized)) {
      return { intent: "spicy_recommendation", language, taste: "spicy" };
    }

    if (/(sweet snacks|kuch meetha recommend karo|meetha|sweet craving|suggest chocolate snacks|chocolate wala)/i.test(normalized)) {
      return { intent: "sweet_recommendation", language, taste: "sweet" };
    }

    if (/(salty|namkeen|mild and salty)/i.test(normalized)) {
      return { intent: "salty_recommendation", language, taste: "salty" };
    }

    if (/(mild snacks|less spicy|non spicy|plain|don't want spicy|dont want spicy|which one is mild|halka spicy)/i.test(normalized)) {
      return { intent: "mild_recommendation", language, taste: "mild" };
    }

    if (/(crunchy snacks|crunchy|crispy)/i.test(normalized)) {
      return { intent: "crunchy_recommendation", language, taste: "crunchy" };
    }

    if (/(^mixed$|show me mixed|mixed snack box|mixed snacks|recommend mixed snacks|mixed bundle|mix of both)/i.test(normalized)) {
      return { intent: "mixed_recommendation", language, taste: "mixed" };
    }

    if (/(kids ke liye|snacks for children|kids snacks|bachon ke liye|best for children|safe for kids|school lunch|what should i order for kids|bachy kha sakty)/i.test(normalized)) {
      return { intent: "kids_recommendation", language, occasion: "kids" };
    }

    if (/(office snacks|office ke liye|team snacks|work snacks|office mein rakhna|office box)/i.test(normalized)) {
      return { intent: "office_recommendation", language, occasion: "office" };
    }

    if (/(movie night snacks|movie night|netflix snacks|netflix snack|cricket match snacks)/i.test(normalized)) {
      return { intent: "movie_night_recommendation", language, occasion: "movie night" };
    }

    if (/(gaming snacks|netflix and gaming|gaming\/netflix)/i.test(normalized)) {
      return { intent: "gaming_netflix_recommendation", language, occasion: "gaming" };
    }

    if (/(gift|gifting|gift bundle|dost ko gift|gift dena hai|birthday snack box|eid gift snack)/i.test(normalized)) {
      return { intent: "gifting_recommendation", language, occasion: "gifting" };
    }

    if (/(party snacks|party bundle|guests|mehman arhy snacks)/i.test(normalized)) {
      return { intent: "party_recommendation", language, occasion: "party" };
    }

    if (/(tea time|chai time|chai ke sath)/i.test(normalized)) {
      return { intent: "tea_time_recommendation", language, occasion: "tea time" };
    }

    if (budget) {
      return { intent: "budget_recommendation", language, budget };
    }

    if (category) {
      return { intent: "product_category_query", language, category };
    }

    if (/(halal|safe for muslims|haram to nahi)/i.test(normalized)) {
      return { intent: "halal_query", language };
    }

    if (/(iso|certified|certification|certificate|which authority certified|haccp|export quality|approved for export|fda approved)/i.test(normalized)) {
      return { intent: "certification_query", language };
    }

    if (/(contain nuts|gluten free|milk|soy|allergen|allergy|peanut allergy|processed near nuts|dairy|nuts)/i.test(normalized)) {
      return {
        intent: "allergen_query",
        language,
        productName: category || this.extractPotentialProductName(userMessage),
      };
    }

    if (/(ingredients|gelatin|msg|made of|oil use|vegetable oil|preservatives|natural or artificial|chicken extract|beef extract|imported ingredients)/i.test(normalized)) {
      return {
        intent: "ingredient_query",
        language,
        productName: category || this.extractPotentialProductName(userMessage),
      };
    }

    if (/(vegan|vegetarian)/i.test(normalized)) {
      return { intent: "vegan_vegetarian_query", language };
    }

    if (/(nutrition|calories|protein|fat|diet snack|healthy snack)/i.test(normalized)) {
      return { intent: "nutrition_query", language };
    }

    if (/(spice level|how spicy)/i.test(normalized)) {
      return { intent: "spice_level_query", language };
    }

    if (/(fresh|freshness|are these fresh|are your products fresh)/i.test(normalized)) {
      return { intent: "product_freshness", language };
    }

    if (/(storage|store these|how to store)/i.test(normalized)) {
      return { intent: "product_storage", language };
    }

    if (/(out of stock|stock available|availability|available\?|restock|restocking|reserve this|new products coming|new arrivals)/i.test(normalized)) {
      return /(restock|restocking)/i.test(normalized)
        ? { intent: "product_restock", language, productName: category || this.extractPotentialProductName(userMessage) }
        : { intent: "product_availability", language, productName: category || this.extractPotentialProductName(userMessage) };
    }

    if (/(too expensive|mehnga|expensive|prices high|price high|why are your prices high|i'll order later|ill order later|i am not sure|i'm not sure)/i.test(normalized)) {
      return { intent: "price_objection", language };
    }

    if (/(delivery charges|shipping charges|free shipping|shipping charges|shiping charges|delivery charges kia|kitna paisa delivery ka|free delivery|free shipping kab)/i.test(normalized)) {
      return /(free shipping)/i.test(normalized)
        ? { intent: "free_shipping_query", language }
        : { intent: "delivery_charges", language };
    }

    if (/(delivery time|kitne din|how long delivery|how long does delivery take|delivery kitny din|delivery$|shipping times)/i.test(normalized)) {
      return { intent: "delivery_time", language };
    }

    if (/(shipping policy|delivery policy|shipping$|lahore delivery hoti|karachi me delivery|islamabad parcel bhejtay|gaon me deliver hoga)/i.test(normalized)) {
      return { intent: "shipping_policy", language };
    }

    if (/(deliver across pakistan|delivery cities|which cities|city delivery|do you deliver to|lahore|karachi|islamabad)/i.test(normalized)) {
      return { intent: "delivery_city", language };
    }

    if (/(same day delivery)/i.test(normalized)) {
      return { intent: "same_day_delivery", language };
    }

    if (/(change address|address change)/i.test(normalized)) {
      return { intent: "address_change", language };
    }

    if (/(delayed order|late delivery|order delayed)/i.test(normalized)) {
      return { intent: "delayed_order", language };
    }

    if (/(cod available|cash on delivery|cod hai|do you offer cod|cash pay kr sakty)/i.test(normalized)) {
      return { intent: "cod_query", language };
    }

    if (/(online payment|card payment|bank transfer|wallet payment|can i pay online|payment$|card chalta|easypaisa|jazzcash)/i.test(normalized)) {
      return { intent: "online_payment", language };
    }

    if (/(whatsapp order|order on whatsapp|can i order on whatsapp)/i.test(normalized)) {
      return { intent: "whatsapp_order", language };
    }

    if (/(payment failed|amount deducted|payment deducted|order not confirmed|paisa kat gya order nahi|payment fail hogya)/i.test(normalized)) {
      return { intent: "payment_failed", language };
    }

    if (/(secure payment|safe to pay)/i.test(normalized)) {
      return { intent: "secure_payment", language };
    }

    if (/(return food items|return request|can i return|return$|return krna|return karna|wapis karna hai|food wapis hota|14 din bad return|packet khol dia return)/i.test(normalized)) {
      return { intent: "return_request", language };
    }

    if (/(refund request|refund mil|refund policy|refund$|refnd|paise wapis)/i.test(normalized)) {
      return { intent: "refund_request", language };
    }

    if (/(refund time|kab refund|paisy wapis kab)/i.test(normalized)) {
      return { intent: "refund_time", language };
    }

    if (/(replacement|replace item|exchange$)/i.test(normalized)) {
      return { intent: "replacement_request", language };
    }

    if (/(damaged item|damaged product|product is damaged|damaged$|product broken|product toot gaya|packet phata hua|chips tuti hui|item kharab hai|expiry wali cheez bheji|smell aa rahi|taste kharab hai)/i.test(normalized)) {
      return { intent: "damaged_product", language };
    }

    if (/(wrong product|wrong item received|wrong item aya|ghalat saman)/i.test(normalized)) {
      return { intent: "wrong_product", language };
    }

    if (/(exchange flavor|change flavor|flavor change karna)/i.test(normalized)) {
      return { intent: "exchange_flavor", language };
    }

    if (/(cancel order|cancellation|cancellation after dispatch)/i.test(normalized)) {
      return { intent: "cancellation_query", language };
    }

    if (/(discount|coupon|promo code|discount code|eid deals|sale hai kya|deal$)/i.test(normalized)) {
      return /(coupon not working|promo code not working|coupon nahi lag raha)/i.test(normalized)
        ? { intent: "coupon_not_working", language }
        : { intent: "discount_query", language };
    }

    if (/(complete my cart|complete checkout|checkout help|should i checkout|cart recovery|cart mein kya add karun)/i.test(normalized)) {
      return { intent: "cart_completion", language };
    }

    if (/(upsell|what else should i add|add on suggestion|aur kya add karun)/i.test(normalized)) {
      return { intent: "upsell_request", language };
    }

    if (/(pair with|goes with|cross sell|iske sath kya loon)/i.test(normalized)) {
      return { intent: "cross_sell_request", language };
    }

    if (/(wholesale|bulk order|dukaan ke liye rate|retailer price|monthly supply|rate list bhejo|agency chahiye|dealership milti|shop pr rakhna hai|school canteen supply)/i.test(normalized)) {
      return { intent: "wholesale_query", language };
    }

    if (/(bulk discount|bulk discounts)/i.test(normalized)) {
      return { intent: "bulk_discount", language };
    }

    if (/(corporate gifting|corporate order|corporate gift|office k liye 50 box)/i.test(normalized)) {
      return { intent: "corporate_gifting", language };
    }

    if (/(event order|event snacks|i need snacks for an event|wedding snacks)/i.test(normalized)) {
      return { intent: "event_order", language };
    }

    if (/(i'm confused|i am confused|confused customer|confused|mujhy samajh nahi araha|konsa loon)/i.test(normalized)) {
      return { intent: "confused_customer", language };
    }

    if (/(returning customer|welcome back|repeat order|regular snacks|order later|i ordered before|i want regular snacks)/i.test(normalized)) {
      return { intent: "repeat_purchase", language };
    }

    if (/(would you like me to take you to this product|take me to this product|show me this product|open this product)/i.test(normalized)) {
      return { intent: "product_navigation_prompt", language };
    }

    if (/(trust|why(?:\s+should\s+i)?\s+buy\s+from\s+snakitos|pakistani products|is this real brand|why are your prices high|are these pakistani snacks)/i.test(normalized)) {
      return { intent: "general_brand_query", language };
    }

    return { intent: "fallback_unknown", language };
  }

  private detectSnakitosLanguage(
    message: string,
  ): "english" | "roman_urdu" | "mixed" {
    const normalized = message.toLowerCase();
    const romanHits = [
      "bhai",
      "batao",
      "kuch",
      "acha",
      "andar",
      "mera",
      "kahan",
      "liye",
      "haan",
      "han",
      "theek",
      "chahiye",
      "karo",
      "meetha",
      "teekha",
      "nachos",
    ].filter((token) => normalized.includes(token)).length;
    const englishHits = [
      "shipping",
      "refund",
      "recommend",
      "product",
      "delivery",
      "bundle",
      "support",
      "movie",
      "office",
      "snack",
    ].filter((token) => normalized.includes(token)).length;

    if (romanHits > 0 && englishHits > 0) {
      return "mixed";
    }

    return romanHits > 0 ? "roman_urdu" : "english";
  }

  private normalizeSnakitosMessage(message: string): string {
    return message
      .trim()
      .toLowerCase()
      .replace(/\bdilevry\b/g, "delivery")
      .replace(/\bdelivry\b/g, "delivery")
      .replace(/\bdlevry\b/g, "delivery")
      .replace(/\bshiping\b/g, "shipping")
      .replace(/\bchrges\b/g, "charges")
      .replace(/\btraking\b/g, "tracking")
      .replace(/\btracker\b/g, "tracking")
      .replace(/\brefnd\b/g, "refund")
      .replace(/\briturn\b/g, "return")
      .replace(/\bordar\b/g, "order")
      .replace(/\bbnana\b/g, "banana")
      .replace(/\bwaffer\b/g, "wafer")
      .replace(/\bspcy\b/g, "spicy")
      .replace(/\bpaisy\b/g, "paise")
      .replace(/\bnhi\b/g, "nahi")
      .replace(/\bkrna\b/g, "karna")
      .replace(/\bkr\b/g, "kar")
      .replace(/\bbhejta?y\b/g, "bhejtay")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractKnownCategory(message: string): string {
    const normalized = this.normalizeSnakitosMessage(message);
    const categoryAliases: Array<{ category: string; pattern: RegExp }> = [
      { category: "Nachos", pattern: /\b(nachos|tortilla chips)\b/i },
      { category: "Stix", pattern: /\b(stix|sticks|hot spicy|peri peri|lemon chilli|masala stix|salty stix)\b/i },
      { category: "Patata", pattern: /\b(patata|potato slim|potato slims)\b/i },
      { category: "Banana Chips", pattern: /\b(banana|banana chips|achari banana|banana bbq|banana sea salt|cheese banana)\b/i },
      { category: "Choco Sticks", pattern: /\b(choco stick|chocolate stick|spread wali stick|strawberry choco)\b/i },
      { category: "Wafer Rolls", pattern: /\b(wafer|wafer rolls|hazelnut wafer|strawberry wafer|cappuccino wafer|dark chocolate wafer)\b/i },
      { category: "ChickPea Puffs", pattern: /\b(chickpea|chickpea puffs|chana puff|chana chips)\b/i },
      { category: "Snaktory", pattern: /\b(snaktory|can tray)\b/i },
    ];

    return categoryAliases.find((item) => item.pattern.test(normalized))?.category ?? "";
  }

  private extractPotentialProductName(message: string): string {
    return this.extractKnownCategory(message) || extractProductQuery(message);
  }

  private async handleSnakitosStructuredIntent(
    classified: ClassifiedIntent,
    userMessage: string,
    chatId: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId"> | null> {
    const language = classified.language;
    const category = classified.category || "";
    const budget = classified.budget || "";

    switch (classified.intent) {
      case "greeting":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              language === "roman_urdu"
                ? "Hi! Main aapka Snakitos snack assistant hoon. Main snack deals, recommendations, shipping/refunds, aur collections mein help kar sakta hoon. Aaj aap ko spicy, sweet, crunchy, ya mixed snack box chahiye?"
                : "Hi! I’m your Snakitos snack assistant. I can help you find snack deals, recommend snacks, explain shipping/refunds, or guide you to the right collection. What are you craving today — spicy, sweet, crunchy, or mixed?",
            userMessage,
            options: this.getQuickMenuOptions(),
            skipSuggestions: true,
          }),
        };
      case "back_home":
      case "main_categories":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              language === "roman_urdu"
                ? "Snakitos ki main snack categories yeh hain:"
                : "Browse the main Snakitos snack collections below:",
            userMessage,
            options: this.getMainCategoryOptions(),
            skipSuggestions: true,
          }),
        };
      case "confirmation_continue":
        return this.handleConfirmationContinue(language, userMessage);
      case "what_do_you_sell":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              "Snakitos offers snacks like Stix, Patata, Banana Chips, Choco Sticks, Wafer Rolls, ChickPea Puffs, Nachos, Snaktory packs, and snack bundles. Are you looking for spicy, sweet, kids-friendly, or mixed snacks?",
            userMessage,
            options: this.getQuickMenuOptions(),
            skipSuggestions: true,
          }),
        };
      case "new_customer_query":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              language === "roman_urdu"
                ? "Welcome! Agar aap pehli dafa order kar rahe hain, to mixed bundle se start karna best rahega takay aap different flavors try kar sakein. Aap spicy pasand karte hain, sweet, ya dono ka mix?"
                : "Welcome to Snakitos! If it’s your first time, I’d suggest starting with a mixed bundle so you can try different flavors. Do you prefer spicy, sweet, or a mix of both?",
            userMessage,
            options: [
              { label: "Spicy", value: "spicy snacks" },
              { label: "Sweet", value: "sweet snacks" },
              { label: "Mixed", value: "mixed snack box" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "budget_prompt":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              language === "roman_urdu"
                ? "Aapka budget kya hai? Aap Under Rs. 500, Under Rs. 1,000, Under Rs. 2,000, ya family-size bundle choose kar sakte hain."
                : "What’s your budget? I can suggest options under Rs. 500, under Rs. 1,000, under Rs. 2,000, or a bigger family-size bundle.",
            userMessage,
            options: [
              { label: "Under Rs. 500", value: "500" },
              { label: "Under Rs. 1,000", value: "1000" },
              { label: "Under Rs. 2,000", value: "2000" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "product_recommendation":
        return {
          intent: "product",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              language === "roman_urdu"
                ? "Zaroor! Main best option recommend kar sakta hoon. Aapko spicy, sweet, salty, crunchy, ya mixed snack box chahiye?"
                : "Sure! I can recommend the best option. What are you craving — spicy, sweet, salty, crunchy, or a mixed snack box?",
            userMessage,
            options: [
              { label: "Spicy", value: "spicy snacks" },
              { label: "Sweet", value: "sweet snacks" },
              { label: "Crunchy", value: "crunchy snacks" },
              { label: "Mixed", value: "mixed snack box" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "best_seller_query":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "best sellers bundle popular snacks",
          "Some popular choices include Stix, Patata, Choco Sticks, Wafer Rolls, Banana Chips, Nachos, and snack bundles. If you want better value, I’d recommend starting with a bundle. Do you prefer spicy, sweet, or mixed?",
          "popular snacks",
        );
      case "best_deals":
      case "bundle_deals":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "bundle combo deal value pack family pack party pack gift box deals",
          "Here are some strong-value Snakitos deals you can check:\n\nMy best value pick is a mixed bundle, because it gives more variety than buying only single packs. Do you want deals under Rs. 1,000, under Rs. 2,000, or family-size bundles?",
          "best deals",
        );
      case "product_category_query":
        return this.buildCategoryResponse(userMessage, category || "Snacks");
      case "spicy_recommendation":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "spicy stix nachos banana chips spicy bundle",
          language === "roman_urdu"
            ? "Zaroor! Agar aapko spicy snacks pasand hain to Stix Hot & Spicy, Stix Peri Peri, Stix Lemon & Chilli, aur Nachos Salsa try karein. Better value ke liye spicy bundle bhi acha rahega. Kya main aapke budget ke hisaab se spicy combo suggest karun?"
            : "If you enjoy spicy snacks, I’d recommend Stix Hot & Spicy, Stix Peri Peri, Stix Lemon & Chilli, Nachos Salsa, Nachos Paprika, and Banana Chips Achari Masti. For better value, you can also go for a spicy bundle. Want me to suggest a spicy combo under your budget?",
          "spicy",
        );
      case "sweet_recommendation":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "sweet choco sticks wafer rolls coco choco sweet bundle",
          language === "roman_urdu"
            ? "Sweet craving ke liye Choco Stick Chocolate, Choco Stick Strawberry, Wafer Rolls Hazelnut, aur Coco Choco Can best options hain. Aap chocolate-only snacks lena chahenge ya sweet + crunchy mix?"
            : "For sweet cravings, I’d recommend Choco Stick Chocolate, Choco Stick Strawberry, Coco Choco Can, Wafer Rolls Hazelnut, Wafer Rolls Strawberry, and a Choco Lovers Bundle. Would you like chocolate-only snacks or a sweet + crunchy mix?",
          "sweet",
        );
      case "mixed_recommendation":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "mixed snack box mixed bundle snack sampler all time favorites office snack box flavor fiesta ultimate mega snack box",
          language === "roman_urdu"
            ? "Mixed snacks ke liye best value picks All Time Favorites, Snack Sampler Deal, Office Snack Box, aur Ultimate Mega Snack Box hain. In mein sweet aur savory dono variety mil jati hai. Kya aap budget-friendly mixed box chahte hain ya family-size bundle?"
            : "For mixed snacks, I'd start with All Time Favorites, Snack Sampler Deal, Office Snack Box, and Ultimate Mega Snack Box. These give you sweet + savory variety instead of just one flavor. Do you want a budget-friendly mixed box or a family-size bundle?",
          "mixed snacks",
        );
      case "salty_recommendation":
        case "mild_recommendation":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "mild salty patata banana chips chickpea puffs stix salty",
          "For something mild and salty, I’d suggest Patata Salty, Banana Chips Sea Salt, ChickPea Puffs, and Stix Salty. You can also add a sweet item like Choco Stick or Wafer Rolls for balance.",
          "salty",
        );
      case "crunchy_recommendation":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "crunchy patata stix nachos banana chips chickpea puffs",
          "For crunchy snacks, I’d recommend Patata, Stix, Nachos, Banana Chips, and ChickPea Puffs. Do you want crunchy and spicy, or crunchy and mild?",
          "crunchy",
        );
      case "kids_recommendation":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "kids snacks choco sticks wafer rolls patata salty kids fun box",
          language === "roman_urdu"
            ? "Kids ke liye Choco Stick, Coco Choco Can, Wafer Rolls Strawberry, aur Patata Salty achay options hain. Agar ready mix chahiye to Kids Fun Box best rahega. Aapka budget kya hai?"
            : "For kids, I’d suggest Choco Stick Chocolate, Choco Stick Strawberry, Coco Choco Can, Wafer Rolls Strawberry, Wafer Rolls Hazelnut, Patata Salty, and a Kids Fun Box. The Kids Fun Box is a good ready-made mix. What’s your budget?",
          "kids",
        );
      case "movie_night_recommendation":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "movie night nachos bundle party crunch shareable snacks",
          "Great! For movie night, I recommend crunchy and shareable snacks like a Movie Night Nachos Bundle, Snakitos Stix Party, Patata Crunch Deal, Nachos Salsa, and Ultimate Snack Deal. How many people are you ordering for?",
          "movie night",
        );
      case "gaming_netflix_recommendation":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "gaming netflix crunchy nachos stix patata banana chips",
          "For Netflix or gaming, go for crunchy snacks like Nachos Salsa, Patata Masala, Stix Peri Peri, Banana Chips, and a Movie Night Nachos Bundle. Want a sweet item added too? Choco Stick or Wafer Rolls pair nicely.",
          "gaming",
        );
      case "office_recommendation":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "office snack box shareable banana chips wafer rolls patata puffs",
          "For office snacking, I’d recommend Office Snack Box, All Time Favorites, Banana Chips Sea Salt, Wafer Rolls, Patata Salty, and ChickPea Puffs. These are easy to share and give a good sweet + savory mix. How many people are in your team?",
          "office",
        );
      case "gifting_recommendation":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "gift bundles mega snack box choco lovers flavor fiesta",
          "Nice idea! For gifting, I’d recommend an Ultimate Mega Snack Box, All Time Favorites, a Choco Lovers Bundle, or a Snakitos Flavor Fiesta Bundle. These feel better than individual packs because they give more variety. Is this gift for kids, family, office, or a friend?",
          "gifting",
        );
      case "party_recommendation":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "party pleaser bundle mega snack box fiesta bundle nachos stix party",
          "For parties, I’d recommend a Party Pleaser Bundle, Ultimate Mega Snack Box, Snakitos Flavor Fiesta Bundle, Nachos packs, and Stix Party. These are shareable and give good variety. How many guests are you expecting?",
          "party",
        );
      case "tea_time_recommendation":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "tea time wafer rolls choco sticks patata puffs banana chips",
          "For tea time, I’d suggest Wafer Rolls, Choco Sticks, Patata Salty, ChickPea Puffs, and Banana Chips Sea Salt. If you want variety, All Time Favorites is a good option.",
          "tea time",
        );
      case "budget_recommendation":
        return this.buildBudgetResponse(userMessage, budget, language);
      case "halal_query":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              "Based on current Snakitos store knowledge, the products are handled as halal and halal certificate support is available on request. If you want, share a product name and I can narrow it down for that item.",
            userMessage,
            options: [
              { label: "Kids Snacks", value: "kids snacks" },
              { label: "Gift Bundles", value: "gift bundles" },
              { label: "Daily Snacks", value: "regular snacks" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "certification_query":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              "Snakitos is a brand by FM Foods. FM Foods lists quality and food safety standards including Halal, ISO 22000, HACCP, SFDA, and FDA-related approvals/compliance. If you need certificate copies for wholesale, export, or corporate buying, support can confirm.",
            userMessage,
            options: [
              { label: "Talk to Support", value: "talk to support" },
              { label: "Bulk Orders", value: "wholesale" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "ingredient_query":
        return {
          intent: "general",
          response: await this.buildSensitiveProductSafetyResponse(
            userMessage,
            classified.productName,
            "Ingredients vary by product. Please check the product packaging or product page for the exact ingredient list. Some snack products may include ingredients such as corn/wheat, vegetable oil, salt, and spices, depending on the product.",
          ),
        };
      case "allergen_query":
        return {
          intent: "general",
          response: await this.buildSensitiveProductSafetyResponse(
            userMessage,
            classified.productName,
            "Allergen information can vary by product. Please check the packaging for the most accurate allergen details. If you have a serious allergy, I recommend confirming with support before placing the order.",
          ),
        };
      case "vegan_vegetarian_query":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              "Some products may be vegetarian-friendly, but ingredients vary by product. Please check the specific product label for dairy, gelatin, or animal-derived ingredients. If you follow a strict vegan or vegetarian diet, support should confirm before you order.",
            userMessage,
            options: [
              { label: "Talk to Support", value: "talk to support" },
              { label: "Show Products", value: "show categories" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "spice_level_query":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              "Some Snakitos products are spicy, while others are mild or sweet. Spicy options include Stix Hot & Spicy, Stix Peri Peri, Stix Lemon & Chilli, Nachos Salsa, Nachos Paprika, and Banana Chips Achari Masti. For non-spicy options, try Choco Sticks, Wafer Rolls, Banana Chips Sea Salt, Patata Salty, or sweet snack bundles.",
            userMessage,
            options: [
              { label: "Spicy Snacks", value: "spicy snacks" },
              { label: "Mild Snacks", value: "mild snacks" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "nutrition_query":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              "I don’t have confirmed exact nutrition information here, and I don’t want to misguide you. Please check the product packaging or product page, or confirm with support before ordering.",
            userMessage,
            options: [
              { label: "Talk to Support", value: "talk to support" },
              { label: "Show Products", value: "show categories" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "shipping_refund_policy":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "policy",
            message:
              "Here’s the quick policy overview:\n\nShipping: orders are processed within 1-2 business days after payment confirmation. Delivery usually takes 2-5 business days after order fulfillment depending on the destination city. Shipping rates are calculated at checkout, and tracking number is sent by email after shipment.\n\nReturns and refunds: eligible returns are allowed within 14 calendar days if the item is unused and in original packaging. Food products are non-refundable unless they arrive damaged or defective. Exchanges are only for defective or damaged items.",
            userMessage,
            policyLink: "https://snakitos.com/policies/",
            options: [
              { label: "Track Order", value: "track my order" },
              { label: "Talk to Support", value: "talk to support" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "shipping_policy":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "Orders are processed within 1-2 business days after payment confirmation. Delivery usually takes 2-5 business days after order fulfillment depending on the destination city. Shipping rates are shown at checkout, and tracking number is shared by email after shipment.",
          "https://snakitos.com/policies/shipping-policy",
        );
      case "delivery_charges":
      case "free_shipping_query":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "Shipping rates are calculated at checkout based on the weight and dimensions of your order and the destination. I don’t have confirmed free-shipping details in the current public policy, so please check checkout or contact support for confirmation.",
          "https://snakitos.com/policies/shipping-policy",
        );
      case "delivery_time":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "Orders are processed within 1-2 business days after payment confirmation. Delivery usually takes 2-5 business days after order fulfillment depending on the destination city.",
          "https://snakitos.com/policies/shipping-policy",
        );
      case "delivery_city":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "Snakitos delivers across Pakistan through courier service. Delivery time and charges may vary by city.",
          "https://snakitos.com/policies/shipping-policy",
        );
      case "same_day_delivery":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "The current public shipping policy does not confirm same-day delivery. Please check checkout or contact Snakitos support for the latest delivery options.",
          "https://snakitos.com/policies/shipping-policy",
        );
      case "address_change":
        return this.buildEscalationPolicyResponse(
          userMessage,
          "If your order has not been dispatched yet, address changes may be possible. Please share your order number and updated address as soon as possible so support can check before dispatch.",
        );
      case "delayed_order":
        return this.buildEscalationPolicyResponse(
          userMessage,
          "I’m sorry about that. Courier delays can happen due to delivery load, route issues, public holidays, weather, or city-specific delays. Please use the Track Order option or share your order number with support.",
        );
      case "cod_query":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "I don’t have confirmed Cash on Delivery information in the current public policy. Please check checkout or contact Snakitos support for confirmation.",
          "https://snakitos.com/policies/shipping-policy",
        );
      case "online_payment":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "I don’t have confirmed exact payment-method details in the current public policy. Please check checkout for available payment options or contact Snakitos support for confirmation.",
          "https://snakitos.com/policies/",
        );
      case "whatsapp_order":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "Yes, you can contact Snakitos support on WhatsApp for help with ordering, product suggestions, or order updates. Before that, I can quickly suggest the best bundle for your taste and budget.",
          "",
        );
      case "payment_failed":
        return this.buildEscalationPolicyResponse(
          userMessage,
          "Sorry about that. Please check whether the amount was deducted. If the amount was not deducted, you can try placing the order again or choose another payment method. If the amount was deducted but your order was not confirmed, please keep a screenshot or transaction ID and contact support for verification.",
        );
      case "secure_payment":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "Payments should only be made through the official Snakitos checkout or official support channels. Avoid sharing sensitive card or banking details in chat.",
          "https://snakitos.com/policies/terms-of-service",
        );
      case "return_request":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "Because these are food items, returns may be limited for hygiene and safety reasons. However, if you received a damaged, wrong, or defective item, please contact support with proof so the case can be reviewed.",
          "https://snakitos.com/policies/refund-policy",
        );
      case "refund_request":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "Because these are food items, returns and refunds may be limited for hygiene and safety reasons. If you received a damaged, wrong, or defective item, support can review your case with proof.",
          "https://snakitos.com/policies/refund-policy",
        );
      case "refund_time":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "Refund timing depends on the payment method and review process. Once approved, support will guide you about the expected refund timeline.",
          "https://snakitos.com/policies/refund-policy",
        );
      case "replacement_request":
      case "damaged_product":
        return this.buildComplaintResponse(
          userMessage,
          "I’m sorry about that. Please share your order number and clear photos or videos of the damaged items and packaging. This helps support review your claim quickly.",
        );
      case "wrong_product":
        return this.buildComplaintResponse(
          userMessage,
          "Sorry for the inconvenience. Please share your order number and a photo of the product received. Support can review and guide you about replacement or correction.",
        );
      case "exchange_flavor":
        return this.buildEscalationPolicyResponse(
          userMessage,
          "If the order has not been dispatched yet, flavor changes may be possible. If it has already been shipped or delivered, exchange may be limited because these are food products.",
        );
      case "cancellation_query":
        return this.buildEscalationPolicyResponse(
          userMessage,
          "Order cancellation usually depends on whether the order has already been dispatched. Please share your order number with support so they can confirm this properly.",
        );
      case "discount_query":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "Current discounts and offers may change from time to time. You can check the Deals section on the website for active offers. I can also recommend the best-value bundle based on your budget.",
          "",
        );
      case "cart_completion":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "best selling snack deals value bundle mixed add on free shipping",
          "I can help you finish the cart smartly. Bundles usually give better value, and I can also suggest a small add-on if you want to get closer to free delivery.",
          "cart completion",
        );
      case "upsell_request":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "bundles trending high margin flavor fiesta office snack box all time favorites",
          "A bundle is usually the best upgrade if you want more variety and better value. I’ve picked a few strong upsell options for you below.",
          "upsell",
        );
      case "cross_sell_request":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "sweet pairing crunchy pairing spicy sweet combo",
          "A good pairing makes the box feel more complete. I’ve added a few natural mix-and-match options below.",
          "cross sell",
        );
      case "coupon_not_working":
        return this.buildPolicyTemplateResponse(
          userMessage,
          "Please check if the coupon is still valid, applies to your selected products, and meets any minimum order requirement. If it still doesn’t work, share a screenshot with support.",
          "",
        );
      case "wholesale_query":
      case "bulk_discount":
        return this.buildEscalationPolicyResponse(
          userMessage,
          "Wholesale or bulk pricing may be available for retailers, offices, events, or corporate buyers. Please share your name, business name, city, required products, quantity, contact number, and delivery location so support can guide you.",
        );
      case "corporate_gifting":
        return this.buildEscalationPolicyResponse(
          userMessage,
          "Corporate snack boxes may be possible for offices, events, and gifting. Please share the quantity, budget per box, city, and preferred snack type.",
        );
      case "event_order":
        return this.buildEscalationPolicyResponse(
          userMessage,
          "Sure! Please share the number of guests, city, event date, and budget. I can suggest bundles, and support can help with bulk pricing.",
        );
      case "confused_customer":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              language === "roman_urdu"
                ? "Koi baat nahi. Bas yeh bata dein: aapko spicy, sweet, kids-friendly, movie-night, office, ya mixed snacks chahiye?"
                : "No worries. Tell me one thing: do you want spicy, sweet, kids-friendly, movie-night, office, or mixed snacks?",
            userMessage,
            options: [
              { label: "Spicy", value: "spicy snacks" },
              { label: "Sweet", value: "sweet snacks" },
              { label: "Kids", value: "kids snacks" },
              { label: "Movie Night", value: "movie night snacks" },
              { label: "Mixed", value: "mixed snack box" },
            ],
            skipSuggestions: true,
          }),
        };
      case "repeat_purchase":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "repeat order office snack box all time favorites mixed snacks",
          "Welcome back! If you enjoyed spicy snacks last time, you can try another Stix flavor, Nachos, or a spicy bundle. If you want something different, I can suggest a sweet + salty mix.",
          "repeat",
        );
      case "price_objection":
        return this.buildCuratedRecommendationResponse(
          userMessage,
          "bundle combo value mixed snack box",
          "I understand. If you want better value, I’d suggest choosing a bundle instead of individual items. Bundles usually give more variety and a better overall snack experience.",
          "value bundle",
        );
      case "product_freshness":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              "Snakitos focuses on quality-packed snacks. For best taste, store products in a cool, dry place and consume before the expiry date printed on the pack.",
            userMessage,
            options: [
              { label: "Show Snacks", value: "show categories" },
              { label: "Talk to Support", value: "talk to support" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "product_storage":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              "For best taste, store your snacks in a cool, dry place and keep the pack sealed after opening.",
            userMessage,
            options: [
              { label: "Show Snacks", value: "show categories" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "product_availability":
      case "product_restock":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              "I’m not fully sure about live stock or restock timing. Please check the product page or contact support for confirmation.",
            userMessage,
            options: [
              { label: "Talk to Support", value: "talk to support" },
              { label: "Show Products", value: "show categories" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "support_request":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              "Sure, I can connect you with Snakitos support. Please share your issue briefly so support can guide you faster.",
            userMessage,
            options: [
              { label: "WhatsApp Support", value: "How can I contact support?" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "general_brand_query":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              "Snakitos offers a wide range of Pakistani snacks, sweet treats, spicy snacks, bundles, and snack boxes. It is a brand by FM Foods, with focus on quality, hygiene, taste, and export-quality production standards. Bundles are especially good if you want more variety and better value.",
            userMessage,
            options: [
              { label: "Best Deals", value: "show best deals" },
              { label: "Best Sellers", value: "show best sellers" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      case "product_navigation_prompt":
        return {
          intent: "general",
          response: await this.buildResponseWithSuggestions({
            type: "fallback",
            message:
              language === "roman_urdu"
                ? "Bilkul. Jis product ko aap dekhna chahte hain, us par 'Open on Snakitos' use karein. Agar aap chahein to main pehle best option recommend bhi kar sakta hoon."
                : "Yes. If you want to open a product, use the 'Open on Snakitos' button under it. If you want, I can also help narrow down the best option first.",
            userMessage,
            options: [
              { label: "Recommend Me", value: "recommend something" },
              { label: "Show Products", value: "show categories" },
              { label: "Home", value: "home" },
            ],
            skipSuggestions: true,
          }),
        };
      default:
        return null;
    }
  }

  private buildStateUpdateFromIntent(
    classified: ClassifiedIntent,
    response: Omit<ChatResponsePayload, "chatId" | "userId">,
  ): Partial<ConversationState> {
    const next: Partial<ConversationState> = {
      last_intent: classified.intent,
      last_topic: classified.category || classified.taste || classified.occasion || classified.intent,
    };

    if (classified.category) {
      next.last_category = classified.category;
    }

    if (classified.budget) {
      next.last_budget = classified.budget;
    }

    if (classified.taste) {
      next.last_taste = classified.taste;
    }

    if (classified.occasion) {
      next.last_occasion = classified.occasion;
    }

    if (
      classified.intent === "best_deals" ||
      classified.intent === "bundle_deals" ||
      classified.intent === "product_category_query" ||
      classified.intent.endsWith("_recommendation") ||
      classified.intent === "best_seller_query"
    ) {
      next.pending_action = "show_more_products";
    } else if (classified.intent === "product_recommendation") {
      next.pending_action = "taste_preference";
    } else {
      next.pending_action = "";
    }

    try {
      const parsed = JSON.parse(response.response) as { products?: Array<{ name?: string }> };
      next.last_recommended_products =
        parsed.products?.map((item) => item.name || "").filter(Boolean).slice(0, 6) ?? [];
    } catch {
      next.last_recommended_products = [];
    }

    if (
      classified.intent.includes("shipping") ||
      classified.intent.includes("refund") ||
      classified.intent.includes("delivery") ||
      classified.intent.includes("payment")
    ) {
      next.last_policy_topic = classified.intent;
    }

    if (
      classified.intent === "damaged_product" ||
      classified.intent === "wrong_product" ||
      classified.intent === "payment_failed" ||
      classified.intent === "support_request"
    ) {
      next.last_support_issue = classified.intent;
    }

    return next;
  }

  private async handleConfirmationContinue(
    language: ClassifiedIntent["language"],
    userMessage: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    return {
      intent: "product",
      response: await this.buildCuratedRecommendationResponseText(
        userMessage,
        "bundle combo deal more options family pack party pack",
        language === "roman_urdu"
          ? "Perfect! Yahan aur snack deals aur bundles hain jo aap explore kar sakte hain:"
          : "Perfect! Here are more snack deals and bundles you can explore:",
      ),
    };
  }

  private getQuickMenuOptions(): Array<{ label: string; value: string }> {
    return [
      { label: "Track Order", value: "track my order" },
      { label: "Snack Deals", value: "show best deals" },
      { label: "Recommend Me Snacks", value: "recommend something" },
      { label: "Shipping & Refunds", value: "show shipping and refund policy" },
      { label: "Talk to Support", value: "talk to support" },
    ];
  }

  private getMainCategoryOptions(): Array<{ label: string; value: string }> {
    return [
      { label: "Snack Deals", value: "show best deals" },
      { label: "Best Sellers", value: "show best sellers" },
      { label: "Spicy Snacks", value: "spicy snacks" },
      { label: "Sweet Snacks", value: "sweet snacks" },
      { label: "Nachos", value: "show me nachos" },
      { label: "Stix", value: "show me stix" },
      { label: "Patata", value: "show me patata" },
      { label: "Banana Chips", value: "show me banana chips" },
      { label: "Choco Sticks", value: "show me choco sticks" },
      { label: "Wafer Rolls", value: "show me wafer rolls" },
      { label: "Kids Snacks", value: "kids snacks" },
      { label: "Office Snacks", value: "office snacks" },
      { label: "Gift Bundles", value: "gift bundles" },
      { label: "Movie Night Snacks", value: "movie night snacks" },
      { label: "Shipping & Refunds", value: "show shipping and refund policy" },
      { label: "Talk to Support", value: "talk to support" },
    ];
  }

  private async buildCuratedRecommendationResponse(
    userMessage: string,
    query: string,
    message: string,
    rankingMessage: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    return {
      intent: "product",
      response: await this.buildCuratedRecommendationResponseText(userMessage, query, message, rankingMessage),
    };
  }

  private async buildCuratedRecommendationResponseText(
    userMessage: string,
    query: string,
    message: string,
    rankingMessage?: string,
  ): Promise<string> {
    const products = await this.getProductsForStructuredQuery(query, rankingMessage || userMessage);
    const freeShippingHint = this.buildFreeShippingHint(products);
    return this.buildResponseWithSuggestions({
      type: "product",
      message: [message, freeShippingHint].filter(Boolean).join("\n\n"),
      userMessage,
      products: this.buildProductCards(products, rankingMessage || userMessage),
      options: [
        { label: "Back", value: "show categories" },
        { label: "Home", value: "home" },
      ],
      skipSuggestions: true,
    });
  }

  private async buildCategoryResponse(
    userMessage: string,
    category: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    const products = await this.getProductsForStructuredQuery(category, category);
    return {
      intent: "product",
      response: await this.buildResponseWithSuggestions({
        type: "product",
        message: `Sure! Here are the ${category} options I found:\n\n${category} pairs nicely with a related snack or a bundle if you want more variety. Do you want spicy, mild, or a combo option?`,
        userMessage,
        products: this.buildProductCards(products, category),
        options: [
          { label: "Best Deals", value: "show best deals" },
          { label: "Recommend Me", value: "recommend something" },
          { label: "Home", value: "home" },
        ],
        skipSuggestions: true,
      }),
    };
  }

  private async buildBudgetResponse(
    userMessage: string,
    budget: string,
    language: ClassifiedIntent["language"],
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    const amount = Number.parseInt(budget, 10);
    const query =
      amount <= 500
        ? "under 500 single packs choco stick patata stix puffs banana chips wafer rolls"
        : amount <= 1000
          ? "under 1000 snack pack choco combo smaller combo deal"
          : amount <= 2000
            ? "under 2000 all time favorites office snack box movie night nachos bundle snack sampler deal"
            : "above 3000 ultimate mega snack box flavor fiesta party pleaser combo";
    const message =
      amount <= 500
        ? "Under Rs. 500, you can try single packs like Choco Stick, Patata, Stix, ChickPea Puffs, Banana Chips, or Wafer Rolls. Do you prefer spicy, sweet, or salty?"
        : amount <= 1000
          ? "Under Rs. 1,000, I’d suggest a Snaktory Snack Pack, Choco Stick Combo, or a smaller combo deal. You’ll get better variety than buying only one item."
          : amount <= 2000
            ? language === "roman_urdu"
              ? "Rs. 2,000 ke andar All Time Favorites, Snack Sampler Deal, Office Snack Box, ya Movie Night Nachos Bundle achay options hain. Aap spicy lena chahenge, sweet, ya mixed?"
              : "Under Rs. 2,000, the best value options are All Time Favorites, Office Snack Box, Movie Night Nachos Bundle, Snakitos Stix Party, and Snack Sampler Deal. Do you want spicy, sweet, or mixed?"
            : "For a bigger order, I’d recommend Ultimate Mega Snack Box, Flavor Fiesta Bundle, Party Pleaser Bundle, or Crunch Munch Combo. These are great for families, offices, parties, and gifting.";

    const products =
      amount > 0 && amount <= 2000
        ? await this.getBudgetProducts(amount)
        : await this.getProductsForStructuredQuery(query, query);

    return {
      intent: "product",
      response: await this.buildResponseWithSuggestions({
        type: "product",
        message: [message, this.buildFreeShippingHint(products)].filter(Boolean).join("\n\n"),
        userMessage,
        products: this.buildProductCards(products, query),
        options: [
          { label: "Back", value: "show categories" },
          { label: "Home", value: "home" },
        ],
        skipSuggestions: true,
      }),
    };
  }

  private async buildSensitiveProductSafetyResponse(
    userMessage: string,
    productName: string | undefined,
    baseMessage: string,
  ): Promise<string> {
    const productLead = productName ? `${productName}: ` : "";
    return this.buildResponseWithSuggestions({
      type: "fallback",
      message: `${productLead}${baseMessage} ${productName ? "" : "Which product are you asking about?"}`.trim(),
      userMessage,
      options: [
        { label: "Talk to Support", value: "talk to support" },
        { label: "Show Products", value: "show categories" },
        { label: "Home", value: "home" },
      ],
      skipSuggestions: true,
    });
  }

  private async buildPolicyTemplateResponse(
    userMessage: string,
    message: string,
    policyLink: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    return {
      intent: "general",
      response: await this.buildResponseWithSuggestions({
        type: "policy",
        message,
        userMessage,
        policyLink,
        options: [
          { label: "Track Order", value: "track my order" },
          { label: "Talk to Support", value: "talk to support" },
          { label: "Home", value: "home" },
        ],
        skipSuggestions: true,
      }),
    };
  }

  private async buildEscalationPolicyResponse(
    userMessage: string,
    message: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    return {
      intent: "general",
      response: await this.buildResponseWithSuggestions({
        type: "fallback",
        message,
        userMessage,
        options: [
          { label: "WhatsApp Support", value: "How can I contact support?" },
          { label: "Home", value: "home" },
        ],
        skipSuggestions: true,
      }),
    };
  }

  private async buildComplaintResponse(
    userMessage: string,
    message: string,
  ): Promise<Omit<ChatResponsePayload, "chatId" | "userId">> {
    return {
      intent: "general",
      response: await this.buildResponseWithSuggestions({
        type: "fallback",
        message,
        userMessage,
        options: [
          { label: "WhatsApp Support", value: "How can I contact support?" },
          { label: "Home", value: "home" },
        ],
        skipSuggestions: true,
      }),
    };
  }

  private async getProductsForStructuredQuery(
    query: string,
    rankingMessage: string,
  ): Promise<ProductLookupResult[]> {
    const direct = await shopifyService.getStorefrontRecommendations(query, 30).catch(() => []);
    const products = direct.length > 0 ? direct : await this.getFallbackProductRecommendations(query);
    const selected = this.selectProductsForResponse(products, rankingMessage).slice(0, 6);
    if (selected.length > 0) {
      return selected;
    }

    const fallbackNames = this.resolveFallbackStructuredProductNames(`${query} ${rankingMessage}`);
    if (fallbackNames.length === 0) {
      return [];
    }

    return this.getProductsByNames(fallbackNames);
  }

  private buildFreeShippingHint(products: ProductLookupResult[]): string {
    const threshold = FREE_SHIPPING_THRESHOLD;
    const closestUnderThreshold = products
      .map((product) => this.parseDisplayPrice(product.price))
      .filter((price) => price > 0 && price < threshold)
      .sort((left, right) => right - left)[0];

    if (!closestUnderThreshold) {
      return "";
    }

    const remaining = threshold - closestUnderThreshold;
    if (remaining <= 0 || remaining > 500) {
      return "";
    }

    return `You’re only Rs. ${remaining} away from free delivery. Want recommendations under Rs. 500?`;
  }

  private async getBudgetProducts(maxAmount: number): Promise<ProductLookupResult[]> {
    const products = await shopifyService.getQuickRecommendations("", 60).catch(() => []);
    const filtered = products
      .filter((product) => {
        const price = this.parseDisplayPrice(product.price);
        return price > 0 && price <= maxAmount;
      })
      .sort((left, right) => this.parseDisplayPrice(right.price) - this.parseDisplayPrice(left.price));

    if (filtered.length > 0) {
      return filtered.slice(0, 6);
    }

    const fallbackNames =
      maxAmount <= 500
        ? ["Choco Stick Chocolate", "Patata Salty", "Stix Peri Peri", "Banana Chips Sea Salt"]
        : maxAmount <= 1000
          ? ["Choco Stick Combo", "Snakitos Snaktory Snack Pack", "Nachos Pack Of 10"]
          : ["All Time Favorites", "Office Snack Box", "Movie Night Nachos Bundle"];

    const fallbackProducts = await this.getProductsByNames(fallbackNames);
    return fallbackProducts
      .filter((product) => {
        const price = this.parseDisplayPrice(product.price);
        return price === 0 || price <= maxAmount;
      })
      .slice(0, 6);
  }

  private async getProductsByNames(names: string[]): Promise<ProductLookupResult[]> {
    const matches = await Promise.all(
      names.map(async (name) => {
        const results = await shopifyService.searchProducts(name).catch(() => []);
        return results[0] ?? null;
      }),
    );

    return matches.filter((item): item is ProductLookupResult => Boolean(item)).slice(0, 6);
  }

  private resolveFallbackStructuredProductNames(seed: string): string[] {
    const normalized = seed.toLowerCase();

    if (/(deal|bundle|combo|value|family|party|gift)/i.test(normalized)) {
      return [
        "All Time Favorites",
        "Office Snack Box",
        "Movie Night Nachos Bundle",
        "Flavor Fiesta Bundle",
        "Party Pleaser Bundle",
        "Choco Lovers Bundle",
      ];
    }

    if (/nachos/i.test(normalized)) {
      return ["Nachos Salsa", "Nachos Paprika", "Movie Night Nachos Bundle", "Nachos Pack Of 10"];
    }

    if (/spicy/i.test(normalized)) {
      return [
        "Stix Hot & Spicy",
        "Stix Peri Peri",
        "Stix Lemon & Chilli",
        "Nachos Salsa",
        "Nachos Paprika",
        "Banana Chips Achari Masti",
      ];
    }

    if (/sweet|choco|wafer/i.test(normalized)) {
      return [
        "Choco Stick Chocolate",
        "Choco Stick Strawberry",
        "Wafer Rolls Hazelnut",
        "Wafer Rolls Strawberry",
        "Coco Choco Can",
        "Choco Lovers Bundle",
      ];
    }

    if (/kids/i.test(normalized)) {
      return [
        "Choco Stick Chocolate",
        "Choco Stick Strawberry",
        "Wafer Rolls Strawberry",
        "Patata Salty",
        "Coco Choco Can",
        "Kids Fun Box",
      ];
    }

    if (/office/i.test(normalized)) {
      return [
        "Office Snack Box",
        "All Time Favorites",
        "Banana Chips Sea Salt",
        "Wafer Rolls Hazelnut",
        "Patata Salty",
        "ChickPea Puffs",
      ];
    }

    if (/movie|gaming|netflix/i.test(normalized)) {
      return [
        "Movie Night Nachos Bundle",
        "Nachos Salsa",
        "Patata Masala",
        "Stix Peri Peri",
        "Banana Chips Sea Salt",
        "Wafer Rolls Hazelnut",
      ];
    }

    return ["All Time Favorites", "Nachos Salsa", "Stix Peri Peri", "Choco Stick Chocolate"];
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
            "Based on current Snakitos store knowledge, the products are handled as halal and halal certificate support is available on request. If you need a certificate copy, please contact support.",
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
    if (this.shouldAskForOrderIdentifier(userMessage)) {
      return {
        intent: "general",
        response: await this.buildResponseWithSuggestions({
          type: "fallback",
          message: "Please share your order number or registered phone/email so I can check your order.",
          userMessage,
          options: [
            { label: "Track Order", value: "track my order" },
            { label: "Contact Support", value: "How can I contact support?" },
            { label: "Home", value: "home" },
          ],
          skipSuggestions: true,
        }),
      };
    }

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

  private shouldAskForOrderIdentifier(userMessage: string): boolean {
    const normalized = userMessage.trim().toLowerCase();
    const hasOrderSignal =
      /^(track|tracking|order|parcel)$/.test(normalized) ||
      /\b(track my order|where is my order|order status|tracking number|parcel track|order kab ayega)\b/i.test(
        normalized,
      );
    const hasIdentifier =
      /#\s*[a-z0-9-]{3,}|\b\d{4,}\b|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|(?:\+?\d[\d\s\-()]{8,}\d)/i.test(
        userMessage,
      );

    return hasOrderSignal && !hasIdentifier;
  }

  private async buildQuickSupportResponse(userMessage: string): Promise<string | null> {
    if (/\b(certificate|certification|certificate chahiye|certificate chaiye|certificate do)\b/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "Based on current Snakitos store knowledge, the products are handled as halal.",
        assistLine: "If you need halal certificate support, please contact support and share the product name if possible.",
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
      /(angry|annoyed|confused|upset|frustrated|not clear|not happy|issue|problem|complaint|why is this not clear|terrible|bakwas|fraud|koi sun nahi raha)/i.test(
        normalized,
      );
    const hasSensitiveSupportTopic =
      /(official website|real store|who owns|brand|deliver|delivery|refund|return|payment|courier|track|parcel|support|service|policy|late|confirmation|tomorrow|order not placed)/i.test(
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
        answer: "I don’t have confirmed Cash on Delivery information in the current public policy.",
        assistLine: "Please check checkout or contact Snakitos support for the latest payment options.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/shipping-policy",
        options: [
          { label: "Shipping Policy", value: "show shipping and refund policy" },
          { label: "Contact Support", value: "How can I contact support?" },
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
        answer: "The current public shipping policy does not confirm same-day delivery, including Karachi-specific same-day service.",
        assistLine: "Please check checkout or contact Snakitos support for the latest delivery options.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/shipping-policy",
        options: [
          { label: "Shipping Policy", value: "show shipping and refund policy" },
          { label: "Contact Support", value: "How can I contact support?" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(same day delivery|same-day delivery|same day hai|same-day hai)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "The current public shipping policy does not confirm same-day delivery.",
        assistLine: "Orders are processed in 1 to 2 business days, and delivery usually takes 2 to 5 business days after fulfillment.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/shipping-policy",
        options: [
          { label: "Shipping Policy", value: "show shipping and refund policy" },
          { label: "Contact Support", value: "How can I contact support?" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(online payment secure|payment secure|safe to pay online|secure payment)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "I don’t have confirmed checkout-security details in the current public policy.",
        assistLine: "Please review the checkout page carefully or contact support if you want exact payment guidance before ordering.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/terms-of-service",
        options: [
          { label: "Policies", value: "show shipping and refund policy" },
          { label: "Contact Support", value: "How can I contact support?" },
          { label: "Home", value: "home" },
        ],
      });
    }

    if (/(payment methods|how can i pay|can i pay online|online payment|payment kaise karein|payment kese karain|online pay kar sakte hain)/i.test(userMessage)) {
      return this.buildGeneralPlaybookResponse({
        userMessage,
        answer: "You can use the standard Snakitos checkout flow, but the current public policy does not clearly confirm the full list of payment methods.",
        assistLine: "Please check checkout or contact support for exact payment options before placing the order.",
        type: "policy",
        policyLink: "https://snakitos.com/policies/terms-of-service",
        options: [
          { label: "Shipping Policy", value: "show shipping and refund policy" },
          { label: "Contact Support", value: "How can I contact support?" },
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
    if (/(what is snakitos|about snakitos|what is your store about|tell me about your brand|brand ke bare mein|brand ke bare me|store ke bare mein|store ke bare me|are you a real store|can i trust this website|official website|ye store real hai|store real hai|real store ho|real hai|what makes your store different|what makes your brand different|who owns this brand|why(?:\s+should\s+i)?\s+buy\s+from\s+snakitos)/i.test(userMessage)) {
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
      baseProducts.length > 0
        ? baseProducts
        : input.skipSuggestions
          ? []
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
            ? `${productDescription} Based on current store knowledge, ${product.title} is handled as halal. If you need halal certificate support, please contact support for the latest confirmation.`
            : `Based on current store knowledge, ${product.title} is handled as halal. If you need halal certificate support, please contact support for the latest confirmation.`
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
      return "Based on current Snakitos store knowledge, the products are handled as halal and halal certificate support is available on request through support.";
    }

    if (/\b(halal|halaal|halal hain|halal hai)\b/i.test(normalizedMessage)) {
      return "Based on current Snakitos store knowledge, the products are handled as halal. If you want the latest certificate support for a specific item, please contact support with the product name.";
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
