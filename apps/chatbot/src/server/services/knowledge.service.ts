import { retrieveKnowledge } from "@lib/pinecone";
import { config } from "../config";
import capabilityKnowledgeData from "../data/capability-knowledge.json";
import generalQueryRagData from "../data/general-query-rag.json";
import snakitosGeneralTrainingData from "../data/snakitos-rag-pack/01-general-query-training-dataset.json";
import snakitosGeneral200kRuntimeData from "../data/snakitos-rag-pack/18-general-200k-runtime.json";
import snakitosEvalSuiteTrainingData from "../data/snakitos-rag-pack/19-eval-suite-training-dataset.json";
import snakitosProductFaqData from "../data/snakitos-rag-pack/02-product-faq-dataset.json";
import snakitosProductRecommendationData from "../data/snakitos-rag-pack/03-product-recommendation-dataset.json";
import snakitosProductRecordsData from "../data/snakitos-rag-pack/15-product-records.json";
import storeFaqKnowledgeData from "../data/store-faq-knowledge.json";
import { KnowledgeDocument } from "../types/chat.types";

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 100;
const RETRIEVAL_TIMEOUT_MS = 1_800;

type LocalGeneralKnowledgeItem = {
  id: string;
  name: string;
  text: string;
  link: string;
  type: string;
  category: string;
  source: string;
  hints?: string[];
};

type StoreFaqKnowledgeItem = LocalGeneralKnowledgeItem;
type SearchCollection =
  | "orders_collection"
  | "products_collection"
  | "store_faq_collection"
  | "router_selects_correct_collection"
  | "trigger_router_then_correct_collection";
type RoutedIntent =
  | "order_status"
  | "product_query"
  | "store_policy"
  | "recommendation"
  | "mixed"
  | "mixed_by_trigger"
  | "store_policy_or_complaint"
  | "store_policy_or_product_detail"
  | "complaint"
  | "wholesale"
  | "unknown";
type RoutedLanguage = "english" | "roman_urdu" | "urdu" | "mixed";
type RoutedAction =
  | "retrieve"
  | "ask_order_number"
  | "ask_clarification"
  | "expand_then_retrieve"
  | "retrieve_or_escalate"
  | "retrieve_then_recommend"
  | "ask_order_number_or_lookup"
  | "escalate_to_support"
  | "retrieve_or_fallback"
  | "ask_business_details";
type QueryRoute = {
  originalQuery: string;
  language: RoutedLanguage;
  normalizedQuery: string;
  intent: RoutedIntent;
  collectionToSearch: SearchCollection;
  searchQueries: string[];
  requiredAction: RoutedAction;
};
type GeneralKnowledgeCategory =
  | "brand_about"
  | "shipping_delivery"
  | "returns_refunds"
  | "payments_checkout"
  | "order_general"
  | "product_general"
  | "account_login"
  | "contact_support"
  | "discounts_promotions"
  | "privacy_security"
  | "technical_website"
  | "wholesale_corporate"
  | "food_safety_allergens"
  | "complaints_escalation"
  | "international_customs"
  | "accessibility_language"
  | "warranty_authenticity"
  | "loyalty_referral"
  | "size_fit_care";

type SnakitosGeneralTrainingItem = {
  id: string;
  intent: string;
  language: string;
  user_query: string;
  ideal_answer: string;
  recommended_products?: string[];
  follow_up_question?: string;
  tags?: string[];
  requires_escalation?: boolean;
};
type SnakitosGeneral200kRuntimeItem = {
  id: string;
  intent: string;
  language: string;
  name: string;
  category: string;
  source: string;
  link: string;
  total_examples: number;
  escalation_rate: number;
  tags?: string[];
  quality_rules?: string[];
  examples?: string[];
  approved_answers?: string[];
  text: string;
};
type SnakitosFaqItem = {
  question: string;
  answer: string;
  category: string;
  related_products?: string[];
  safe_upsell?: string;
  escalation_required?: boolean;
};
type SnakitosRecommendationItem = {
  id: string;
  trigger_type: string;
  trigger_value: string;
  response_style: string;
  primary_recommendations?: string[];
  bundle_priority?: string[];
  balancing_add_on?: string;
  follow_up_question?: string;
};
type SnakitosProductRecordItem = {
  product_name: string;
  category: string;
  flavor_type: string;
  taste_tags?: string[];
  occasion_tags?: string[];
  price_tags?: string[];
  product_type: string;
  safety_tags?: string[];
  kids_friendly: string;
  spice_level: string;
  storage: string;
  stock_status: string;
  upsell_products?: string[];
  cross_sell_products?: string[];
  bundle_upgrade?: string;
  frequently_bought_with?: string[];
  best_seller?: boolean;
  high_margin?: boolean;
  trending?: boolean;
};

export class KnowledgeService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: KnowledgeDocument[] }
  >();

  async retrieve(query: string): Promise<KnowledgeDocument[]> {
    const route = this.buildQueryRoute(query);
    if (!route.normalizedQuery) {
      return [];
    }

    const cacheKey = [
      this.normalizeRouteIntent(route.intent),
      this.normalizeRouteCollection(route.collectionToSearch),
      ...route.searchQueries,
    ].join(" || ");
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const localResults = this.retrieveLocalKnowledge(route);

    if (!config.openai.apiKey || !config.pinecone.apiKey || !config.pinecone.indexName) {
      this.setCache(cacheKey, localResults);
      return localResults;
    }

    try {
      const results = await this.retrieveWithTimeout(route);

      const mapped = results.map((item) => ({
        id: item.id,
        name: item.name,
        text: item.text,
        link: item.link,
        type: item.type,
        category: item.category,
        source: "pinecone",
      }));

      const merged = this.rerankKnowledge(route, this.mergeKnowledge(localResults, mapped));
      this.setCache(cacheKey, merged);
      return merged;
    } catch {
      this.setCache(cacheKey, localResults);
      return localResults;
    }
  }

  private async retrieveWithTimeout(route: QueryRoute) {
    const normalizedCollection = this.normalizeRouteCollection(route.collectionToSearch);
    const topK = normalizedCollection === "store_faq_collection" ? 8 : 5;
    const tasks = route.searchQueries.map((searchQuery) =>
      Promise.race([
        retrieveKnowledge({
          query: searchQuery,
          topK,
          runtimeConfig: {
            openAiApiKey: config.openai.apiKey,
            pineconeApiKey: config.pinecone.apiKey,
            pineconeIndexName: config.pinecone.indexName,
            pineconeNamespace: config.pinecone.namespace,
            storefrontDomain: config.shopify.storefrontDomain,
          },
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Knowledge retrieval timed out.")), RETRIEVAL_TIMEOUT_MS);
        }),
      ]),
    );

    const settled = await Promise.allSettled(tasks);
    const successful = settled
      .filter(
        (item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof retrieveKnowledge>>> =>
          item.status === "fulfilled",
      )
      .flatMap((item) => item.value);

    return successful;
  }

  private setCache(query: string, value: KnowledgeDocument[]): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(query, {
      value,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  private retrieveLocalKnowledge(route: QueryRoute): KnowledgeDocument[] {
    const retrievalQuery = route.searchQueries.join(" ");
    const normalizedCollection = this.normalizeRouteCollection(route.collectionToSearch);
    const capabilityResults = this.retrieveCapabilityKnowledge(retrievalQuery);
    const generalResults = this.retrieveGeneralKnowledge(retrievalQuery);
    const general200kRuntimeResults = this.retrieveSnakitosGeneral200kRuntime(retrievalQuery);
    const storeFaqResults = this.retrieveStoreFaqKnowledge(retrievalQuery);
    const snakitosGeneralTrainingResults = this.retrieveSnakitosGeneralTraining(retrievalQuery);
    const snakitosFaqResults = this.retrieveSnakitosFaqKnowledge(retrievalQuery);
    const snakitosRecommendationResults = this.retrieveSnakitosRecommendationKnowledge(retrievalQuery);
    const snakitosProductRecordResults = this.retrieveSnakitosProductRecordKnowledge(retrievalQuery);

    const merged =
      normalizedCollection === "store_faq_collection"
        ? this.mergeKnowledge(
            this.mergeKnowledge(
              this.mergeKnowledge(storeFaqResults, generalResults),
              general200kRuntimeResults,
            ),
            this.mergeKnowledge(capabilityResults, snakitosGeneralTrainingResults),
          )
        : normalizedCollection === "products_collection"
          ? this.mergeKnowledge(
              this.mergeKnowledge(
                this.mergeKnowledge(snakitosFaqResults, snakitosRecommendationResults),
                snakitosProductRecordResults,
              ),
              capabilityResults,
            )
          : this.mergeKnowledge(
              this.mergeKnowledge(this.mergeKnowledge(storeFaqResults, generalResults), general200kRuntimeResults),
              capabilityResults,
            );

    return this.rerankKnowledge(route, merged);
  }

  private buildQueryRoute(query: string): QueryRoute {
    const originalQuery = query.trim();
    const normalized = originalQuery
      .toLowerCase()
      .replace(/[?!.,]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const semanticQuery = this.buildMultilingualSemanticQuery(originalQuery);
    const routedQuery = [normalized, semanticQuery].filter(Boolean).join(" ");
    const language = this.detectQueryLanguage(originalQuery);
    const orderIdentifierPattern =
      /(#\s*[a-z0-9-]{3,}|\b\d{4,}\b|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|(?:\+?\d[\d\s\-()]{8,}\d))/i;
    const keywordRouteMatchers: Array<{
      matcher: RegExp;
      normalizedQuery: string;
      intent: RoutedIntent;
      collectionToSearch: SearchCollection;
      publicCollectionToSearch?: SearchCollection;
      requiredAction?: RoutedAction;
      categoryQuery: string;
      keywords: string;
      romanUrdu: string;
    }> = [
      {
        matcher: /^(delivery|shipping)$/i,
        normalizedQuery: "What is Snakitos delivery time and shipping policy?",
        intent: "mixed_by_trigger",
        collectionToSearch: "store_faq_collection",
        publicCollectionToSearch: "trigger_router_then_correct_collection",
        requiredAction: "expand_then_retrieve",
        categoryQuery: "category: shipping policy",
        keywords: "shipping delivery courier tracking order fulfillment charges",
        romanUrdu: "order kab ayega delivery kitne din parcel kab milega",
      },
      {
        matcher: /^refund$/i,
        normalizedQuery: "What is Snakitos refund policy?",
        intent: "store_policy_or_complaint",
        collectionToSearch: "store_faq_collection",
        requiredAction: "retrieve_or_escalate",
        categoryQuery: "category: return refund policy",
        keywords: "return refund damaged defective non-refundable food product",
        romanUrdu: "paise wapis return kharab product",
      },
      {
        matcher: /^return$/i,
        normalizedQuery: "Can I return my Snakitos order?",
        intent: "store_policy_or_complaint",
        collectionToSearch: "store_faq_collection",
        requiredAction: "retrieve_or_escalate",
        categoryQuery: "category: return refund policy",
        keywords: "return refund unused original packaging 14 days",
        romanUrdu: "wapis karna hai return policy",
      },
      {
        matcher: /^(number|contact)$/i,
        normalizedQuery: "How can I contact Snakitos?",
        intent: "store_policy",
        collectionToSearch: "store_faq_collection",
        categoryQuery: "category: contact",
        keywords: "phone contact support helpline mobile email whatsapp address",
        romanUrdu: "number do contact kaise karun",
      },
      {
        matcher:
          /^(agent se baat|complaint karni hai|repeat complaint|legal issue|privacy issue|support call back|bohat gussa hoon|i will report you|bad quality|payment fraud|return reject kyu|item missing|parcel open aya|taste expired jaisa)$/i,
        normalizedQuery: "The customer wants complaint escalation or human support from Snakitos.",
        intent: "complaint",
        collectionToSearch: "store_faq_collection",
        requiredAction: "escalate_to_support",
        categoryQuery: "category: complaint support",
        keywords: "complaint escalation support agent issue damaged wrong item privacy legal",
        romanUrdu: "agent se baat complaint karni hai support chahiye",
      },
      {
        matcher: /^address$/i,
        normalizedQuery: "Where is Snakitos located?",
        intent: "store_policy",
        collectionToSearch: "store_faq_collection",
        categoryQuery: "category: contact",
        keywords: "address location physical store karachi site fm foods",
        romanUrdu: "address kya hai",
      },
      {
        matcher: /^(track|tracking)$/i,
        normalizedQuery: "How can I track my order?",
        intent: "mixed_by_trigger",
        collectionToSearch: "orders_collection",
        publicCollectionToSearch: "trigger_router_then_correct_collection",
        requiredAction: "expand_then_retrieve",
        categoryQuery: "category: order tracking",
        keywords: "tracking order status parcel dispatch email tracking number",
        romanUrdu: "parcel track order kab ayega",
      },
      {
        matcher: /^order$/i,
        normalizedQuery: "The customer may want order status. Ask for order number or registered phone/email.",
        intent: "mixed_by_trigger",
        collectionToSearch: "orders_collection",
        publicCollectionToSearch: "trigger_router_then_correct_collection",
        requiredAction: "expand_then_retrieve",
        categoryQuery: "category: order tracking",
        keywords: "order status order number phone email",
        romanUrdu: "order kab ayega",
      },
      {
        matcher: /^(complaint|damaged|exchange|cancel|cod|payment)$/i,
        normalizedQuery:
          normalized === "damaged"
            ? "What should I do if my product arrived damaged?"
            : normalized === "exchange"
              ? "Can I exchange a damaged or defective item?"
              : normalized === "cancel"
                ? "Can I cancel my order?"
                : normalized === "cod"
                  ? "Is cash on delivery available?"
                  : normalized === "payment"
                    ? "What payment methods are available?"
                    : "How can I submit a complaint to Snakitos?",
        intent:
          normalized === "cod" || normalized === "payment"
            ? "store_policy"
            : normalized === "exchange"
              ? "store_policy_or_complaint"
              : normalized === "complaint" || normalized === "damaged"
                ? "complaint"
                : "store_policy_or_complaint",
        collectionToSearch: "store_faq_collection",
        requiredAction:
          normalized === "cod" || normalized === "payment"
            ? "retrieve_or_fallback"
            : normalized === "complaint" || normalized === "damaged"
              ? "escalate_to_support"
              : "retrieve_or_escalate",
        categoryQuery:
          normalized === "damaged"
            ? "category: damaged item support"
            : normalized === "exchange" || normalized === "cancel"
              ? "category: return refund policy"
              : normalized === "cod" || normalized === "payment"
                ? "category: payment policy"
                : "category: complaint support",
        keywords:
          normalized === "damaged"
            ? "damaged defective issue proof purchase exchange"
            : normalized === "exchange"
              ? "exchange defective damaged same product"
              : normalized === "cancel"
                ? "cancel order address changes support"
                : normalized === "cod"
                  ? "cash on delivery cod payment checkout"
                  : normalized === "payment"
                    ? "payment method checkout online payment secure"
                    : "complaint contact support issue order details",
        romanUrdu:
          normalized === "damaged"
            ? "kharab product defective item"
            : normalized === "exchange"
              ? "replace karna hai damaged product"
              : normalized === "cancel"
                ? "order cancel karna hai"
                : normalized === "cod"
                  ? "cod hai cash on delivery"
                  : normalized === "payment"
                    ? "payment kaise karni hai"
                    : "complain kaise karni",
      },
      {
        matcher: /^(charges|discount|coupon)$/i,
        normalizedQuery:
          normalized === "charges"
            ? "What are Snakitos shipping charges?"
            : normalized === "coupon"
              ? "How do Snakitos coupon codes work?"
              : "What discounts or deals are active on Snakitos?",
        intent: "mixed_by_trigger",
        collectionToSearch: "store_faq_collection",
        publicCollectionToSearch: "trigger_router_then_correct_collection",
        requiredAction: "expand_then_retrieve",
        categoryQuery:
          normalized === "charges"
            ? "category: shipping charges"
            : "category: discount policy",
        keywords:
          normalized === "charges"
            ? "shipping charges delivery fee courier city checkout"
            : "discount coupon promo code deals offer bundle value",
        romanUrdu:
          normalized === "charges"
            ? "delivery charges kitna paisa"
            : "discount coupon promo code sale",
      },
      {
        matcher: /^(banana|chips|stix|wafer|choco|bundle|deal|gift)$/i,
        normalizedQuery:
          normalized === "banana"
            ? "Show Snakitos banana chips products."
            : normalized === "chips"
              ? "Show chips or snack products."
              : normalized === "stix"
                ? "Show Snakitos Stix products."
                : normalized === "wafer"
                  ? "Show Snakitos wafer products."
                  : normalized === "choco"
                    ? "Show Snakitos chocolate or choco products."
                    : normalized === "gift"
                      ? "Show snack gift or bundle options."
                      : "Show Snakitos bundles or deals.",
        intent: normalized === "gift" ? "recommendation" : "product_query",
        collectionToSearch: "products_collection",
        categoryQuery:
          normalized === "banana"
            ? "category: banana chips"
            : normalized === "stix"
              ? "category: multi grain stix"
              : normalized === "wafer"
                ? "category: sweet tooth wafers"
                : normalized === "choco"
                  ? "category: choco products"
                  : normalized === "gift"
                    ? "category: gift bundles"
                    : "category: deals",
        keywords:
          normalized === "banana"
            ? "banana chips bbq sea salt achari cheese snack"
            : normalized === "chips"
              ? "banana chips potato slims multi grain stix chickpea puffs"
              : normalized === "stix"
                ? "stix multi grain hot spicy lemon chilli peri peri salty"
                : normalized === "wafer"
                  ? "wafer rolls hazelnut strawberry dark chocolate cappuccino"
                  : normalized === "choco"
                    ? "choco stick coco choco chocolate spread sweet tooth"
                    : normalized === "gift"
                      ? "gift bundle mixed snack box party office family"
                      : "bundle deal snack sampler all time favorites flavor fiesta",
        romanUrdu:
          normalized === "banana"
            ? "banana chips flavour price available"
            : normalized === "chips"
              ? "chips dikhao snacks batao"
              : normalized === "stix"
                ? "stix dikhao spicy ya salty"
                : normalized === "wafer"
                  ? "wafer rolls dikhao"
                  : normalized === "choco"
                    ? "choco snacks dikhao"
                    : normalized === "gift"
                      ? "gift ke liye snacks batao"
                    : "bundle deal dikhao",
      },
      {
        matcher:
          /^(stix hot spicy|office box|kids box|chana puff|multi grain snacks|sweet tooth snacks|deals collection|can tray|craving combo|snack heaven)$/i,
        normalizedQuery: `Show exact product or collection details for ${normalized}.`,
        intent: "product_query",
        collectionToSearch: "products_collection",
        requiredAction: "retrieve",
        categoryQuery: "category: products",
        keywords: "product collection price flavor availability bundle snack box",
        romanUrdu: "product details price flavour",
      },
    ];

    const matchedRoute = keywordRouteMatchers.find(({ matcher }) => matcher.test(normalized));
    if (matchedRoute) {
      return {
        originalQuery,
        language,
        normalizedQuery: matchedRoute.normalizedQuery,
        intent: matchedRoute.intent,
        collectionToSearch:
          matchedRoute.publicCollectionToSearch ?? matchedRoute.collectionToSearch,
        searchQueries: [
           routedQuery,
          matchedRoute.normalizedQuery,
          matchedRoute.keywords,
          matchedRoute.romanUrdu,
          matchedRoute.categoryQuery,
        ],
        requiredAction:
          matchedRoute.requiredAction ??
          (this.normalizeRouteIntent(matchedRoute.intent) === "order_status" &&
          !orderIdentifierPattern.test(originalQuery)
            ? "ask_order_number_or_lookup"
            : "retrieve"),
      };
    }

    const intent = this.inferRoutedIntent(routedQuery);
    const normalizedIntent = this.normalizeRouteIntent(intent);
    const collectionToSearch =
      normalizedIntent === "order_status"
        ? "orders_collection"
        : normalizedIntent === "store_policy"
          ? "store_faq_collection"
          : normalizedIntent === "unknown"
            ? "store_faq_collection"
            : "products_collection";
    const normalizedQuery = this.expandNormalizedQuery(routedQuery, normalizedIntent);
    const keywordQuery = this.buildKeywordQuery(routedQuery, normalizedIntent);
    const romanUrduQuery = this.buildRomanUrduQuery(routedQuery, normalizedQuery, normalizedIntent);
    const categoryQuery = this.buildCategoryQuery(routedQuery, normalizedIntent);
    const publicCollection =
      intent === "mixed"
        ? "router_selects_correct_collection"
        : collectionToSearch;
    const requiredAction = this.resolveRouteAction(intent, normalizedIntent, routedQuery, originalQuery, orderIdentifierPattern);

    return {
      originalQuery,
      language,
      normalizedQuery,
      intent,
      collectionToSearch: publicCollection,
      searchQueries: [normalized, semanticQuery, normalizedQuery, keywordQuery, romanUrduQuery, categoryQuery].filter(Boolean),
      requiredAction,
    };
  }

  private buildMultilingualSemanticQuery(query: string): string {
    const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
    const terms = new Set<string>();
    const add = (value: string, matcher: RegExp): void => {
      if (matcher.test(normalized)) {
        terms.add(value);
      }
    };
    const hasUrdu = (codePointTerms: number[][]): boolean =>
      codePointTerms.some((term) => normalized.includes(String.fromCodePoint(...term)));
    const urdu = (...codePoints: number[]): number[] => codePoints;

    add(
      "brand about store what do you sell",
      /\b(what do you sell|what is snakitos|about|brand|company|real store|original website|kis cheez ka store|kya bechte|ap log kya bechte|aap kya bechte|aap kon ho|ap kon ho|kon ho)\b/i,
    );
    if (
      hasUrdu([
        urdu(0x0628, 0x0631, 0x0627, 0x0646, 0x0688),
        urdu(0x062f, 0x06a9, 0x0627, 0x0646),
        urdu(0x0627, 0x0633, 0x0679, 0x0648, 0x0631),
        urdu(0x0628, 0x06cc, 0x0686, 0x062a, 0x06d2),
      ])
    ) {
      terms.add("brand about store what do you sell");
    }

    add(
      "shipping delivery delivery time courier pakistan",
      /\b(delivery|shipping|courier|parcel|kitne din|kitny din|kab tak|kab ayega|deliver|shehar|city)\b/i,
    );
    if (
      hasUrdu([
        urdu(0x0688, 0x06cc, 0x0644, 0x06cc, 0x0648, 0x0631, 0x06cc),
        urdu(0x062a, 0x0631, 0x0633, 0x06cc, 0x0644),
        urdu(0x067e, 0x0627, 0x0631, 0x0633, 0x0644),
        urdu(0x06a9, 0x062a, 0x0646, 0x06d2),
      ])
    ) {
      terms.add("shipping delivery delivery time courier pakistan");
    }

    add(
      "payment checkout cash on delivery",
      /\b(payment|paisa|paise|cod|cash on delivery|checkout|easypaisa|jazzcash|adaigi|adayi|payment kaise)\b/i,
    );
    if (
      hasUrdu([
        urdu(0x0627, 0x062f, 0x0627, 0x0626, 0x06cc, 0x06af, 0x06cc),
        urdu(0x067e, 0x06cc, 0x0633, 0x06d2),
        urdu(0x0686, 0x06cc, 0x06a9, 0x0622, 0x0624, 0x0679),
        urdu(0x06a9, 0x06cc, 0x0634),
      ])
    ) {
      terms.add("payment checkout cash on delivery");
    }

    add(
      "returns refunds exchange support",
      /\b(refund|return|wapis|wapas|paise wapis|replace|exchange|tabdeel|kharab|damaged)\b/i,
    );
    if (
      hasUrdu([
        urdu(0x0631, 0x06cc, 0x0641, 0x0646, 0x0688),
        urdu(0x0648, 0x0627, 0x067e, 0x0633),
        urdu(0x062a, 0x0628, 0x062f, 0x06cc, 0x0644),
        urdu(0x0634, 0x06a9, 0x0627, 0x06cc, 0x062a),
        urdu(0x062e, 0x0631, 0x0627, 0x0628),
      ])
    ) {
      terms.add("returns refunds exchange support");
    }

    add(
      "contact support whatsapp phone email address",
      /\b(contact|rabta|rabita|number|phone|whatsapp|email|address|pata)\b/i,
    );
    if (
      hasUrdu([
        urdu(0x0631, 0x0627, 0x0628, 0x0637, 0x06c1),
        urdu(0x0646, 0x0645, 0x0628, 0x0631),
        urdu(0x0648, 0x0627, 0x0679, 0x0633, 0x0627, 0x067e),
        urdu(0x0627, 0x06cc, 0x0645, 0x06cc, 0x0644),
        urdu(0x067e, 0x062a, 0x06c1),
      ])
    ) {
      terms.add("contact support whatsapp phone email address");
    }

    add(
      "order process place order checkout",
      /\b(how to order|how do i order|order kaise|kaise order|order karna|checkout kaise|order process)\b/i,
    );
    if (
      hasUrdu([
        urdu(0x0622, 0x0631, 0x0688, 0x0631),
        urdu(0x0622, 0x0631, 0x0688, 0x0631, 0x0020, 0x06a9, 0x06cc, 0x0633, 0x06d2),
        urdu(0x0686, 0x06cc, 0x06a9),
      ])
    ) {
      terms.add("order process place order checkout");
    }

    add(
      "product facts ingredients halal freshness storage expiry",
      /\b(ingredient|ingredients|ajza|halal|fresh|taza|expiry|shelf life|storage|store kaise|safe)\b/i,
    );
    if (
      hasUrdu([
        urdu(0x0627, 0x062c, 0x0632, 0x0627, 0x0621),
        urdu(0x062d, 0x0644, 0x0627, 0x0644),
        urdu(0x062a, 0x0627, 0x0632, 0x06c1),
        urdu(0x0645, 0x06cc, 0x0639, 0x0627, 0x062f),
        urdu(0x0645, 0x062d, 0x0641, 0x0648, 0x0638),
      ])
    ) {
      terms.add("product facts ingredients halal freshness storage expiry");
    }

    add(
      "snack recommendation products best spicy sweet salty kids",
      /\b(recommend|suggest|best|snack|snacks|products|spicy|sweet|salty|meetha|teekha|namkeen|kids|bachay|bache|tasty)\b/i,
    );
    if (
      hasUrdu([
        urdu(0x062a, 0x062c, 0x0648, 0x06cc, 0x0632),
        urdu(0x0633, 0x0641, 0x0627, 0x0631, 0x0634),
        urdu(0x0628, 0x06c1, 0x062a, 0x0631),
        urdu(0x0645, 0x06cc, 0x0679, 0x06be, 0x0627),
        urdu(0x0646, 0x0645, 0x06a9, 0x06cc, 0x0646),
        urdu(0x0628, 0x0686, 0x0648, 0x06ba),
      ])
    ) {
      terms.add("snack recommendation products best spicy sweet salty kids");
    }

    add(
      "complaint support issue",
      /\b(complaint|issue|problem|masla|masla hai|support|agent|shikayat)\b/i,
    );
    if (
      hasUrdu([
        urdu(0x0634, 0x06a9, 0x0627, 0x06cc, 0x062a),
        urdu(0x0645, 0x0633, 0x0626, 0x0644, 0x06c1),
        urdu(0x0645, 0x0634, 0x06a9, 0x0644),
        urdu(0x0633, 0x067e, 0x0648, 0x0631, 0x0679),
      ])
    ) {
      terms.add("complaint support issue");
    }

    return [...terms].join(" ");
  }

  /*
  private buildLegacyMultilingualSemanticQuery(query: string): string {
    const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
    const terms = new Set<string>();
    const add = (value: string, matcher: RegExp): void => {
      if (matcher.test(normalized)) {
        terms.add(value);
      }
    };

    add(
      "brand about store what do you sell",
      /\b(what do you sell|what is snakitos|about|brand|company|real store|original website|kis cheez ka store|kya bechte|ap log kya bechte|aap kya bechte|aap kon ho|ap kon ho|kon ho)\b/i,
    );
    add(
      "shipping delivery delivery time courier pakistan",
      /\b(delivery|shipping|courier|parcel|kitne din|kitny din|kab tak|kab ayega|deliver|shehar|city)\b|[\u062f\u068c\u0644\u06cc\u0648\u0631\u06cc\u062a\u0631\u0633\u06cc\u0644\u067e\u0627\u0631\u0633\u0644\u0634\u06c1\u0631\u06a9\u062a\u0646\u06d2 \u062f\u0646]/u,
    );
    add(
      "payment checkout cash on delivery",
      /\b(payment|paisa|paise|cod|cash on delivery|checkout|easypaisa|jazzcash|adaigi|adayi|payment kaise)\b|[\u0627\u062f\u0627\u0626\u06cc\u06af\u06cc\u067e\u06cc\u0633\u06d2\u0686\u06cc\u06a9 \u0622\u0624\u0679\u06a9\u06cc\u0634 \u0622\u0646 \u0688\u0644\u06cc\u0648\u0631\u06cc]/u,
    );
    add(
      "returns refunds exchange support",
      /\b(refund|return|wapis|wapas|paise wapis|replace|exchange|tabdeel|kharab|damaged)\b|[\u0631\u06cc\u0641\u0646\u0688\u0648\u0627\u067e\u0633\u0648\u0627\u067e\u0633\u06cc\u0631\u0642\u0645\u062a\u0628\u062f\u06cc\u0644\u06cc\u0634\u06a9\u0627\u06cc\u062a\u062e\u0631\u0627\u0628]/u,
    );
    add(
      "contact support whatsapp phone email address",
      /\b(contact|rabta|rabita|number|phone|whatsapp|email|address|pata)\b|[\u0631\u0627\u0628\u0637\u06c1\u0646\u0645\u0628\u0631\u0648\u0627\u0679\u0633\u0627\u067e\u0627\u06cc\u0645\u06cc\u0644\u067e\u062a\u06c1]/u,
    );
    add(
      "order process place order checkout",
      /\b(how to order|how do i order|order kaise|kaise order|order karna|checkout kaise|order process)\b|[\u0622\u0631\u0688\u0631\u06a9\u06cc\u0633\u06d2\u06a2\u0631\u0646\u0627\u0686\u06cc\u06a9 \u0622\u0624\u0679]/u,
    );
    add(
      "product facts ingredients halal freshness storage expiry",
      /\b(ingredient|ingredients|ajza|halal|fresh|taza|expiry|shelf life|storage|store kaise|safe)\b|[\u0627\u062c\u0632\u0627\u0621\u062d\u0644\u0627\u0644\u062a\u0627\u0632\u06c1\u0645\u06cc\u0639\u0627\u062f\u0627\u0645\u062d\u0641\u0648\u0638]/u,
    );
    add(
      "snack recommendation products best spicy sweet salty kids",
      /\b(recommend|suggest|best|snack|snacks|products|spicy|sweet|salty|meetha|teekha|namkeen|kids|bachay|bache|tasty)\b|[\u062a\u062c\u0648\u06cc\u0632\u0633\u0641\u0627\u0631\u0634\u0628\u06c1\062a\0631\u0645\u06cc\u0679\06be\0627\u0646مکین\u0628\u0686\0648\06ba]/u,
    );
    add(
      "complaint support issue",
      /\b(complaint|issue|problem|masla|masla hai|support|agent|shikayat)\b|[\u0634\u06a9\u0627\u06cc\u062a\u0645\u0633\u0626\u0644\u06c1\u0645\u0634\u06a9\u0644\u0633\u067e\u0648\u0631\u0679]/u,
    );

    return [...terms].join(" ");
  }
  */

  private detectQueryLanguage(message: string): RoutedLanguage {
    if (/[\u0600-\u06FF]/.test(message)) {
      return /[a-z]/i.test(message) ? "mixed" : "urdu";
    }

    const normalized = message.toLowerCase();
    const romanHits = [
      "bhai",
      "kya",
      "hai",
      "hain",
      "kaise",
      "kitne",
      "kitni",
      "wapis",
      "kharab",
      "parcel",
      "order kab ayega",
      "chahiye",
    ].filter((token) => normalized.includes(token)).length;
    const englishHits = ["delivery", "refund", "tracking", "policy", "product", "bundle", "gift"].filter(
      (token) => normalized.includes(token),
    ).length;

    if (romanHits > 0 && englishHits > 0) {
      return "mixed";
    }

    return romanHits > 0 ? "roman_urdu" : "english";
  }

  private inferRoutedIntent(normalized: string): RoutedIntent {
    if (/^(hello|hi|hey|salam|help|location|karachi kahan)$/.test(normalized)) {
      return "store_policy";
    }
    if (
      /^(what do you sell|about|snakitos kya hai|ye store kis cheez ka hai|ap log kya bechte ho|pakistani snacks hain|brand kis ka hai|fm foods hai kya|shop online hai|kya ye original site hai|shop ka naam|ye snacks kis company ke hain|contact|number|email|address|complaint form)$/.test(
        normalized,
      ) ||
      /\b(what do you sell|about snakitos|about us|brand kis ka hai|who owns this brand|fm foods|real store|original site|official website|support chahiye|agent se baat|human se baat|shop ka naam)\b/i.test(
        normalized,
      )
    ) {
      return "store_policy";
    }
    if (
      /\b(order kab ayega|mera parcel kidar hai|delivery kitny din|dilevry charges kia|paise wapis|wapis karna hai|kharab product aya|packet phata hua|wrong item bhej dia|number do|address kya hai|cod hai|cash pe milega|kids ke liye kya acha|bulk order chahiye|dukandar rate chahiye|complain kaise karni|spicy snacks batao|meetha snack|2000 ke andar kya hai|office ke liye snacks|gift dena hai|bhai chips chahiye)\b/i.test(
        normalized,
      )
    ) {
      return "mixed";
    }
    if (
      /\b(track|tracking|where is my order|order status|order kab ayega|order id|phone se check karo|courier status|order detail|shipment status|order shipped|order confirm|awb number|delivery guy number|mujhy order dekhna hai|mera package|order \d+ status|payment ke bad order|mera order nahi aya|order cancel karna hai|address change karna hai|i dont have order number|i don't have order number|i dont have order no|i don't have order no|no order number|no order no)\b/i.test(
        normalized,
      )
    ) {
      return "order_status";
    }
    if (
      /\b(service bakwas|fraud hai|mujhe refund do|wrong item mila|damaged item|paisa kat gaya|order missing|allergy issue|certificate copy chahiye|wholesale rate do|agent se baat|human chahiye|complaint karni hai|repeat complaint|legal issue|privacy issue|support call back|bohat gussa hoon|i will report you|bad quality|payment fraud|return reject kyu|parcel open aya|item missing|taste expired jaisa)\b/i.test(
        normalized,
      )
    ) {
      return "complaint";
    }
    if (
      /\b(halal|certified|iso|haccp|fda approved|ingredients|oil konsa use hota|msg|gelatin|chicken extract|beef extract|allergy|allergen|nuts|gluten|milk|soy|vegan|vegetarian|shelf life)\b/i.test(
        normalized,
      )
    ) {
      return "store_policy_or_product_detail";
    }
    if (
      /\b(wholesale|bulk order|retailer price|shop ke liye rate|100 carton chahiye|corporate gift|office ke liye 50 box|event order|wedding snacks|school canteen|monthly supply|distributor banna hai|dealership|rate list bhejo|business supply)\b/i.test(
        normalized,
      )
    ) {
      return "wholesale";
    }
    if (/\b(do you deliver pakistan|courier name|tracking email|parcel late|delivery|shipping|return|refund|exchange|damaged|complaint|cancel|contact|number|email|address|cod|payment|privacy|terms|bank transfer|easypaisa|jazzcash|amount deducted|order not confirmed|coupon not working|discount code|checkout issue)\b/i.test(normalized)) {
      return "store_policy";
    }
    if (
      /\b(kya loon|bohat teekha|meetha chahiye|salty snack|crunchy snack|kids ke liye|school lunch|office snack|movie night|netflix snack|cricket match snack|family ke liye|birthday snack|party snacks|chai ke sath|late night craving|under 500|under 1000|under 2000|3000 ka box|cheap snacks|sasti cheez batao|mujhy mix chahiye|recommend|best|gift|bundle suggestion|kids snack|tea|spicy|sweet|mixed)\b/i.test(
        normalized,
      )
    ) {
      return "recommendation";
    }
    if (
      /\b(stix hot spicy|office box|kids box|chana puff|multi grain snacks|sweet tooth snacks|deals collection|can tray|craving combo|snack heaven|banana|chips|stix|wafer|choco|nachos|salsa|paprika|chocolate|bundle|deal|price|stock|flavor|patata|potato|slims|rolls|coco choco|chickpea|snaktory|namkeen)\b/i.test(
        normalized,
      )
    ) {
      return "product_query";
    }
    return normalized ? "unknown" : "unknown";
  }

  private normalizeRouteCollection(collection: SearchCollection): "orders_collection" | "products_collection" | "store_faq_collection" {
    if (collection === "router_selects_correct_collection" || collection === "trigger_router_then_correct_collection") {
      return "store_faq_collection";
    }
    return collection;
  }

  private normalizeRouteIntent(intent: RoutedIntent): "order_status" | "product_query" | "store_policy" | "recommendation" | "unknown" {
    switch (intent) {
      case "mixed":
      case "mixed_by_trigger":
      case "store_policy_or_complaint":
      case "store_policy_or_product_detail":
      case "complaint":
      case "wholesale":
        return "store_policy";
      default:
        return intent;
    }
  }

  private resolveRouteAction(
    publicIntent: RoutedIntent,
    normalizedIntent: "order_status" | "product_query" | "store_policy" | "recommendation" | "unknown",
    normalized: string,
    originalQuery: string,
    orderIdentifierPattern: RegExp,
  ): RoutedAction {
    if (publicIntent === "mixed_by_trigger") {
      return "expand_then_retrieve";
    }
    if (publicIntent === "mixed") {
      return "retrieve_or_escalate";
    }
    if (publicIntent === "recommendation" || normalizedIntent === "recommendation") {
      return "retrieve_then_recommend";
    }
    if (publicIntent === "wholesale") {
      return "ask_business_details";
    }
    if (publicIntent === "complaint") {
      return "escalate_to_support";
    }
    if (
      publicIntent === "store_policy_or_complaint" ||
      publicIntent === "store_policy_or_product_detail"
    ) {
      return "retrieve_or_escalate";
    }
    if (normalizedIntent === "order_status") {
      return orderIdentifierPattern.test(originalQuery) ? "ask_order_number_or_lookup" : "ask_order_number_or_lookup";
    }
    if (normalizedIntent === "unknown") {
      return "ask_clarification";
    }
    if (/\b(wholesale|bulk|retailer|corporate|distributor|canteen|monthly supply)\b/i.test(normalized)) {
      return "ask_business_details";
    }
    if (/\b(refund|return|exchange|damaged|wrong item|defective|expired|taste bad|packet broken)\b/i.test(normalized)) {
      return "retrieve_or_escalate";
    }
    return "retrieve";
  }

  private expandNormalizedQuery(normalized: string, intent: RoutedIntent): string {
    if (intent === "store_policy") {
      if (/\bdelivery\b/i.test(normalized)) {
        return "What is Snakitos delivery time and shipping policy?";
      }
      if (/\bshipping\b/i.test(normalized)) {
        return "What are Snakitos shipping charges, delivery time, and tracking process?";
      }
      if (/\brefund\b/i.test(normalized)) {
        return "What is Snakitos refund policy?";
      }
      if (/\breturn\b/i.test(normalized)) {
        return "Can I return my Snakitos order?";
      }
      if (/\bcontact|number\b/i.test(normalized)) {
        return "How can I contact Snakitos?";
      }
    }
    if (intent === "order_status") {
      return /\border\b/i.test(normalized)
        ? "How can I track my order?"
        : `Order status or tracking request: ${normalized}`;
    }
    if (intent === "product_query") {
      return `Show Snakitos products related to ${normalized}.`;
    }
    if (intent === "recommendation") {
      return `Recommend Snakitos snacks for ${normalized}.`;
    }
    return normalized;
  }

  private buildKeywordQuery(normalized: string, intent: RoutedIntent): string {
    if (intent === "store_policy") {
      return [normalized, "policy", "support", "faq", "contact", "delivery", "refund", "tracking"]
        .filter(Boolean)
        .join(" ");
    }
    if (intent === "order_status") {
      return [normalized, "order status", "tracking", "parcel", "dispatch", "tracking number"]
        .filter(Boolean)
        .join(" ");
    }
    if (intent === "recommendation") {
      return [normalized, "best snack", "bundle", "gift", "spicy", "sweet", "mixed"]
        .filter(Boolean)
        .join(" ");
    }
    if (intent === "product_query") {
      return [normalized, "product", "price", "flavor", "category", "deal", "bundle"]
        .filter(Boolean)
        .join(" ");
    }
    return normalized;
  }

  private buildRomanUrduQuery(
    normalized: string,
    normalizedQuery: string,
    intent: RoutedIntent,
  ): string {
    if (intent === "store_policy") {
      return normalized.includes("delivery")
        ? "delivery kitne din shipping policy parcel kab milega"
        : normalized.includes("refund") || normalized.includes("return")
          ? "paise wapis return policy wapis karna hai"
          : normalized.includes("contact") || normalized.includes("number")
            ? "number do contact kaise karun"
            : normalizedQuery.toLowerCase();
    }
    if (intent === "order_status") {
      return "order kab ayega parcel track tracking number";
    }
    if (intent === "product_query") {
      return `${normalized} snacks dikhao product price available`;
    }
    if (intent === "recommendation") {
      return `${normalized} snacks recommend karo`;
    }
    return normalized;
  }

  private buildCategoryQuery(normalized: string, intent: RoutedIntent): string {
    if (intent === "store_policy") {
      if (/\b(delivery|shipping|track|tracking)\b/i.test(normalized)) {
        return "category: shipping policy";
      }
      if (/\b(refund|return|exchange|damaged)\b/i.test(normalized)) {
        return "category: return refund policy";
      }
      if (/\b(contact|number|address)\b/i.test(normalized)) {
        return "category: contact";
      }
      if (/\b(cod|payment)\b/i.test(normalized)) {
        return "category: payment policy";
      }
      return "category: store faq";
    }
    if (intent === "order_status") {
      return "category: order tracking";
    }
    if (intent === "recommendation") {
      return "category: snack recommendation";
    }
    if (/\bbanana\b/i.test(normalized)) {
      return "category: banana chips";
    }
    if (/\bstix\b/i.test(normalized)) {
      return "category: multi grain stix";
    }
    if (/\bwafer\b/i.test(normalized)) {
      return "category: wafer rolls";
    }
    if (/\bchoco\b/i.test(normalized)) {
      return "category: choco";
    }
    if (/\bbundle|deal|gift\b/i.test(normalized)) {
      return "category: deals";
    }
    return "category: products";
  }

  private rerankKnowledge(route: QueryRoute, documents: KnowledgeDocument[]): KnowledgeDocument[] {
    const tokens = route.searchQueries.join(" ").split(/[^a-z0-9+.-]+/).filter((token) => token.length >= 2);
    const normalizedCollection = this.normalizeRouteCollection(route.collectionToSearch);
    return documents
      .map((document) => {
        const haystack = `${document.name} ${document.text} ${document.category} ${document.type}`.toLowerCase();
        const tokenScore = tokens.filter((token) => haystack.includes(token)).length;
        const collectionBoost =
          normalizedCollection === "store_faq_collection"
            ? document.source === "store_faq" || document.type === "policy"
              ? 20
              : -2
            : normalizedCollection === "products_collection"
              ? /snakitos_(faq|recommendation|product_record)/.test(document.source) || document.type === "faq"
                ? 14
                : -2
              : /order-support|policy/.test(document.category)
                ? 8
                : 0;
        const exactBoost = haystack.includes(route.originalQuery.toLowerCase()) ? 8 : 0;
        return {
          score: tokenScore + collectionBoost + exactBoost,
          document,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, normalizedCollection === "store_faq_collection" ? 8 : 6)
      .map((item) => item.document);
  }

  private retrieveCapabilityKnowledge(query: string): KnowledgeDocument[] {
    const tokens = query.split(/[^a-z0-9]+/).filter((token) => token.length >= 2);

    return capabilityKnowledgeData
      .map((item) => {
        const keywordMatches = item.keywords.filter((keyword) => query.includes(keyword.toLowerCase()))
          .length;
        const tokenMatches = tokens.filter(
          (token) =>
            item.description.toLowerCase().includes(token) ||
            item.name.toLowerCase().includes(token) ||
            item.keywords.some((keyword) => keyword.toLowerCase().includes(token)),
        ).length;
        const score = keywordMatches * 5 + tokenMatches;

        return {
          score,
          document: {
            id: item.id,
            name: item.name,
            text: item.description,
            link: item.link,
            type: item.type,
            category: item.category,
            source: "capability_doc",
          } satisfies KnowledgeDocument,
        };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
      .map((item) => item.document);
  }

  private retrieveGeneralKnowledge(query: string): KnowledgeDocument[] {
    const tokens = query.split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
    const docs = generalQueryRagData as LocalGeneralKnowledgeItem[];
    const targetCategories = this.inferGeneralKnowledgeCategories(query);
    const queryWithoutExpansions = query.split(/\s+(?:weight|size|grams|certificate|expiry|shelf life|ingredients|spicy|sweet|salty|same day delivery|advance payment|delivery all over pakistan|contact support|whatsapp|refund|return|exchange|kids|school lunch|kids fun box|office|office snack box|movie night|gaming|netflix|movie night nachos bundle|gift|gift box|ultimate mega snack box|bundle|combo|deal|value|under_500|under_1000|under_2000|above_3000|budget)\b/i)[0]?.trim() ?? query;
    const strongQueryPhrases = queryWithoutExpansions
      .split(/[?.!,;:]/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 6);

    return docs
      .map((item) => {
        const loweredText = item.text.toLowerCase();
        const loweredName = item.name.toLowerCase();
        const loweredCategory = item.category.toLowerCase();
        const loweredHints = (item.hints ?? []).map((hint) => hint.toLowerCase());
        const isMixedChunk = loweredCategory === "mixed_general_knowledge";
        const textLength = loweredText.length;

        const keywordMatches = loweredHints.filter((hint) => query.includes(hint)).length;
        const tokenMatches = tokens.filter(
          (token) =>
            loweredText.includes(token) ||
            loweredName.includes(token) ||
            loweredCategory.includes(token) ||
            loweredHints.some((hint) => hint.includes(token)),
        ).length;

        const phraseBoost =
          (/\b(brand|about|store|trust)\b/.test(query) && /brand_about/.test(loweredText) ? 8 : 0) +
          (/\b(delivery|shipping|courier|track)\b/.test(query) && /shipping|delivery/.test(loweredText) ? 8 : 0) +
          (/\b(refund|return|exchange)\b/.test(query) && /refund|return|exchange/.test(loweredText) ? 8 : 0) +
          (/\b(payment|cod|cash on delivery)\b/.test(query) && /payment|cash on delivery/.test(loweredText) ? 8 : 0) +
          (/\b(contact|support|whatsapp)\b/.test(query) && /support|contact/.test(loweredText) ? 8 : 0);

        const categoryBoost = targetCategories.reduce((boost, category) => {
          if (
            loweredCategory === category ||
            loweredText.includes(`category key: \`${category}\``) ||
            loweredText.includes(`faq ${category.toUpperCase()}-`)
          ) {
            return boost + 18;
          }

          return boost;
        }, 0);

        const exactQuestionBoost = strongQueryPhrases.reduce((boost, phrase) => {
          const loweredPhrase = phrase.toLowerCase();
          if (loweredText.includes(`for questions like '${loweredPhrase}'`)) {
            return boost + 14;
          }

          if (loweredText.includes(loweredPhrase)) {
            return boost + 6;
          }

          return boost;
        }, 0);

        const specificityBoost =
          targetCategories.length > 0 && !isMixedChunk ? 10 : 0;
        const mixedChunkPenalty =
          targetCategories.length > 0 && isMixedChunk ? -8 : 0;
        const lengthPenalty =
          isMixedChunk && textLength > 2_500 ? -4 : textLength > 5_500 ? -2 : 0;

        const score =
          keywordMatches * 6 +
          tokenMatches +
          phraseBoost +
          categoryBoost +
          exactQuestionBoost +
          specificityBoost +
          mixedChunkPenalty +
          lengthPenalty;

        return {
          score,
          document: {
            id: item.id,
            name: item.name,
            text: item.text,
            link: item.link,
            type: item.type,
            category: item.category,
            source: item.source,
          } satisfies KnowledgeDocument,
        };
      })
      .filter((item) => item.score > 1)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6)
      .map((item) => item.document);
  }

  private inferGeneralKnowledgeCategories(query: string): GeneralKnowledgeCategory[] {
    const categoryMatchers: Array<[GeneralKnowledgeCategory, RegExp]> = [
      [
        "brand_about",
        /\b(brand|about|about us|who are you|what do you sell|real store|trust|physical shop|based|company|pakistani brand)\b/i,
      ],
      [
        "shipping_delivery",
        /\b(shipping|delivery|courier|dispatch|ship nationwide|deliver to|same day|late delivery|free delivery|city|coverage)\b/i,
      ],
      [
        "returns_refunds",
        /\b(return|refund|exchange|money back|wrong item|damaged item|replacement|return shipping)\b/i,
      ],
      [
        "payments_checkout",
        /\b(payment|cod|cash on delivery|bank transfer|card|checkout|invoice|secure payment|wallet|payment deducted)\b/i,
      ],
      [
        "order_general",
        /\b(place an order|how do i order|order confirmation|change order|cancel order|change address|after i order|need an account to order)\b/i,
      ],
      [
        "product_general",
        /\b(recommend|best seller|best product|new arrival|fresh|original|discount on products|what should i buy)\b/i,
      ],
      [
        "account_login",
        /\b(account|login|log in|password|reset password|order history|saved address|change phone number|guest checkout)\b/i,
      ],
      [
        "contact_support",
        /\b(contact|support|agent|human|whatsapp|call|live chat|support hours|complain)\b/i,
      ],
      [
        "discounts_promotions",
        /\b(discount|promo|promo code|coupon|offer|sale|free shipping|bundle deal|promotion)\b/i,
      ],
      [
        "privacy_security",
        /\b(privacy|secure|data safe|otp|password safety|card safety|phishing|banking credentials)\b/i,
      ],
      [
        "technical_website",
        /\b(website issue|page not loading|checkout bug|cart issue|site broken|search not working|technical issue)\b/i,
      ],
      [
        "wholesale_corporate",
        /\b(wholesale|bulk|corporate|reseller|quotation|partnership|distributor|100 pieces|office supply)\b/i,
      ],
      [
        "food_safety_allergens",
        /\b(ingredient|ingredients|allergen|allergy|nuts|gluten|halal|expiry|fresh|store it|storage|safe for kids|pregnant)\b/i,
      ],
      [
        "complaints_escalation",
        /\b(angry|bad service|fraud|terrible experience|manager|report you|nobody is replying|refund now)\b/i,
      ],
      [
        "international_customs",
        /\b(international|customs|duties|uAE|usa|outside pakistan|import tax|ship abroad)\b/i,
      ],
      [
        "accessibility_language",
        /\b(roman urdu|urdu|simple english|step by step|not technical|cannot read|accessibility|language)\b/i,
      ],
      [
        "warranty_authenticity",
        /\b(warranty|authentic|genuine|defective|original product|quality guaranteed)\b/i,
      ],
      [
        "loyalty_referral",
        /\b(loyalty|referral|reward points|wallet balance|store credit|points missing)\b/i,
      ],
      [
        "size_fit_care",
        /\b(size chart|size guide|fit|wash|shrink|material|care instructions|how to use)\b/i,
      ],
    ];

    return categoryMatchers
      .filter(([, matcher]) => matcher.test(query))
      .map(([category]) => category);
  }

  private retrieveStoreFaqKnowledge(query: string): KnowledgeDocument[] {
    const tokens = query.split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
    const docs = storeFaqKnowledgeData as StoreFaqKnowledgeItem[];

    return docs
      .map((item) => {
        const loweredText = item.text.toLowerCase();
        const loweredName = item.name.toLowerCase();
        const loweredCategory = item.category.toLowerCase();
        const loweredHints = (item.hints ?? []).map((hint) => hint.toLowerCase());

        const keywordMatches = loweredHints.filter(
          (hint) => query.includes(hint) || hint.includes(query),
        ).length;
        const tokenMatches = tokens.filter(
          (token) =>
            loweredText.includes(token) ||
            loweredName.includes(token) ||
            loweredCategory.includes(token) ||
            loweredHints.some((hint) => hint.includes(token)),
        ).length;

        const phraseBoost =
          (/\b(halal|halaal|certificate|pha)\b/.test(query) && /halal/.test(loweredCategory) ? 10 : 0) +
          (/\b(delivery|shipping|courier|dispatch)\b/.test(query) && /delivery/.test(loweredCategory)
            ? 12
            : 0) +
          (/\b(track|tracking|order status|parcel)\b/.test(query) && /order-support/.test(loweredCategory)
            ? 12
            : 0) +
          (/\b(cod|cash on delivery|payment|checkout|easypaisa|jazzcash)\b/.test(query) &&
          /payment/.test(loweredCategory)
            ? 12
            : 0) +
          (/\b(refund|return|exchange|wapis|wapas|replace)\b/.test(query) &&
          /refund|return/.test(loweredCategory)
            ? 12
            : 0) +
          (/\b(expiry|shelf life|ingredients|weight|wazan|pack size|fresh)\b/.test(query) &&
          /product-facts|trust-support/.test(loweredCategory)
            ? 10
            : 0) +
          (/\b(contact|support|whatsapp|wholesale|bulk)\b/.test(query) &&
          /support|support-escalation/.test(loweredCategory)
            ? 12
            : 0) +
          (/\b(store|brand|about|physical|location)\b/.test(query) && /store-faq/.test(loweredCategory)
            ? 10
            : 0);

        const score = keywordMatches * 7 + tokenMatches + phraseBoost;

        return {
          score,
          document: {
            id: item.id,
            name: item.name,
            text: item.text,
            link: item.link,
            type: item.type,
            category: item.category,
            source: item.source,
          } satisfies KnowledgeDocument,
        };
      })
      .filter((item) => item.score > 1)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6)
      .map((item) => item.document);
  }

  private retrieveSnakitosGeneralTraining(query: string): KnowledgeDocument[] {
    const tokens = query.split(/[^a-z0-9_]+/).filter((token) => token.length >= 2);
    const docs = [
      ...(snakitosGeneralTrainingData as SnakitosGeneralTrainingItem[]),
      ...(snakitosEvalSuiteTrainingData as SnakitosGeneralTrainingItem[]),
    ];

    return docs
      .map((item) => {
        const haystack = [
          item.user_query,
          item.ideal_answer,
          item.intent,
          item.language,
          ...(item.recommended_products ?? []),
          item.follow_up_question ?? "",
          ...(item.tags ?? []),
          typeof item.requires_escalation === "boolean"
            ? item.requires_escalation
              ? "requires escalation"
              : "no escalation"
            : "",
        ]
          .join(" ")
          .toLowerCase();

        const tokenMatches = tokens.filter((token) => haystack.includes(token)).length;
        const phraseBoost =
          (haystack.includes(query) ? 10 : 0) +
          ((item.language === "roman_urdu" && /\b(bhai|acha|chahiye|andar|ke liye)\b/.test(query)) ? 6 : 0);
        const score = tokenMatches * 3 + phraseBoost;

        return {
          score,
          document: {
            id: item.id,
            name: `Training: ${item.intent}`,
            text: `${item.user_query}\n${item.ideal_answer}`,
            link: "https://snakitos.com",
            type: "knowledge",
            category: `training_${item.intent}`,
            source: "snakitos_training",
          } satisfies KnowledgeDocument,
        };
      })
      .filter((item) => item.score > 2)
      .sort((left, right) => right.score - left.score)
      .slice(0, 4)
      .map((item) => item.document);
  }

  private retrieveSnakitosGeneral200kRuntime(query: string): KnowledgeDocument[] {
    const tokens = query.split(/[^a-z0-9_]+/).filter((token) => token.length >= 2);
    const docs = snakitosGeneral200kRuntimeData as SnakitosGeneral200kRuntimeItem[];

    return docs
      .map((item) => {
        const haystack = [
          item.intent,
          item.language,
          item.text,
          ...(item.tags ?? []),
          ...(item.quality_rules ?? []),
          ...(item.examples ?? []),
          ...(item.approved_answers ?? []),
        ]
          .join(" ")
          .toLowerCase();

        const tokenMatches = tokens.filter((token) => haystack.includes(token)).length;
        const phraseBoost =
          (haystack.includes(query) ? 16 : 0) +
          ((item.language === "roman_urdu" || item.language === "mixed") &&
          /\b(bhai|kya|hai|hain|kaise|kitne|wapis|kharab|parcel|chahiye)\b/.test(query)
            ? 6
            : 0) +
          (item.intent && query.includes(item.intent.replace(/_/g, " ")) ? 8 : 0);
        const datasetBoost = item.total_examples >= 3000 ? 4 : 0;
        const score = tokenMatches * 4 + phraseBoost + datasetBoost;

        return {
          score,
          document: {
            id: item.id,
            name: item.name,
            text: item.text,
            link: item.link,
            type: "knowledge",
            category: item.category,
            source: item.source,
          } satisfies KnowledgeDocument,
        };
      })
      .filter((item) => item.score > 2)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6)
      .map((item) => item.document);
  }

  private retrieveSnakitosFaqKnowledge(query: string): KnowledgeDocument[] {
    const tokens = query.split(/[^a-z0-9_]+/).filter((token) => token.length >= 2);
    const docs = snakitosProductFaqData as SnakitosFaqItem[];

    return docs
      .map((item, index) => {
        const haystack = [
          item.question,
          item.answer,
          item.category,
          ...(item.related_products ?? []),
          item.safe_upsell ?? "",
        ]
          .join(" ")
          .toLowerCase();
        const tokenMatches = tokens.filter((token) => haystack.includes(token)).length;
        const phraseBoost = haystack.includes(query) || query.includes(item.question.toLowerCase()) ? 12 : 0;
        const score = tokenMatches * 4 + phraseBoost;

        return {
          score,
          document: {
            id: `snakitos-faq-${index + 1}`,
            name: item.question,
            text: item.answer,
            link: "https://snakitos.com",
            type: "faq",
            category: item.category.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            source: "snakitos_faq",
          } satisfies KnowledgeDocument,
        };
      })
      .filter((item) => item.score > 2)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6)
      .map((item) => item.document);
  }

  private retrieveSnakitosRecommendationKnowledge(query: string): KnowledgeDocument[] {
    const tokens = query.split(/[^a-z0-9_]+/).filter((token) => token.length >= 2);
    const docs = snakitosProductRecommendationData as SnakitosRecommendationItem[];

    return docs
      .map((item) => {
        const haystack = [
          item.trigger_type,
          item.trigger_value,
          item.response_style,
          ...(item.primary_recommendations ?? []),
          ...(item.bundle_priority ?? []),
          item.balancing_add_on ?? "",
          item.follow_up_question ?? "",
        ]
          .join(" ")
          .toLowerCase();
        const tokenMatches = tokens.filter((token) => haystack.includes(token)).length;
        const phraseBoost = haystack.includes(query) ? 12 : 0;
        const score = tokenMatches * 4 + phraseBoost;

        return {
          score,
          document: {
            id: item.id,
            name: `Recommendation: ${item.trigger_type} ${item.trigger_value}`,
            text: [
              `Trigger: ${item.trigger_type}=${item.trigger_value}`,
              `Primary: ${(item.primary_recommendations ?? []).join(", ")}`,
              `Bundles: ${(item.bundle_priority ?? []).join(", ")}`,
              item.balancing_add_on ? `Add-on: ${item.balancing_add_on}` : "",
              item.follow_up_question ?? "",
            ]
              .filter(Boolean)
              .join("\n"),
            link: "https://snakitos.com/collections/all",
            type: "intent",
            category: `recommendation_${item.trigger_type}`,
            source: "snakitos_recommendation",
          } satisfies KnowledgeDocument,
        };
      })
      .filter((item) => item.score > 2)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
      .map((item) => item.document);
  }

  private retrieveSnakitosProductRecordKnowledge(query: string): KnowledgeDocument[] {
    const tokens = query.split(/[^a-z0-9_]+/).filter((token) => token.length >= 2);
    const docs = snakitosProductRecordsData as SnakitosProductRecordItem[];

    return docs
      .map((item, index) => {
        const haystack = [
          item.product_name,
          item.category,
          item.flavor_type,
          item.product_type,
          item.kids_friendly,
          item.spice_level,
          item.storage,
          item.stock_status,
          ...(item.taste_tags ?? []),
          ...(item.occasion_tags ?? []),
          ...(item.price_tags ?? []),
          ...(item.safety_tags ?? []),
          ...(item.upsell_products ?? []),
          ...(item.cross_sell_products ?? []),
          item.bundle_upgrade ?? "",
          ...(item.frequently_bought_with ?? []),
        ]
          .join(" ")
          .toLowerCase();
        const tokenMatches = tokens.filter((token) => haystack.includes(token)).length;
        const phraseBoost =
          (query.includes(item.product_name.toLowerCase()) ? 15 : 0) +
          (item.best_seller && /\b(best|seller|popular)\b/.test(query) ? 6 : 0) +
          (item.trending && /\b(trending|new|popular)\b/.test(query) ? 4 : 0);
        const score = tokenMatches * 3 + phraseBoost;

        return {
          score,
          document: {
            id: `snakitos-product-record-${index + 1}`,
            name: item.product_name,
            text: [
              `${item.product_name} is a ${item.flavor_type} ${item.category} snack.`,
              `Taste tags: ${(item.taste_tags ?? []).join(", ")}.`,
              `Occasions: ${(item.occasion_tags ?? []).join(", ")}.`,
              `Upsell: ${(item.upsell_products ?? []).join(", ")}.`,
              `Cross-sell: ${(item.cross_sell_products ?? []).join(", ")}.`,
              item.bundle_upgrade ? `Bundle upgrade: ${item.bundle_upgrade}.` : "",
            ]
              .filter(Boolean)
              .join(" "),
            link: "https://snakitos.com/collections/all",
            type: "product",
            category: item.category.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            source: "snakitos_product_record",
          } satisfies KnowledgeDocument,
        };
      })
      .filter((item) => item.score > 2)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
      .map((item) => item.document);
  }

  private mergeKnowledge(
    localResults: KnowledgeDocument[],
    pineconeResults: KnowledgeDocument[],
  ): KnowledgeDocument[] {
    const seen = new Set<string>();
    const merged = [...localResults, ...pineconeResults].filter((item) => {
      const key = `${item.source}:${item.id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return merged.slice(0, 6);
  }
}

export const knowledgeService = new KnowledgeService();
