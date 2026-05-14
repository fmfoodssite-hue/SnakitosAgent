import { retrieveKnowledge } from "@lib/pinecone";
import { config } from "../config";
import capabilityKnowledgeData from "../data/capability-knowledge.json";
import generalQueryRagData from "../data/general-query-rag.json";
import snakitosGeneralTrainingData from "../data/snakitos-rag-pack/01-general-query-training-dataset.json";
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
    const normalizedQuery = this.normalizeQueryForRetrieval(query);
    if (!normalizedQuery) {
      return [];
    }

    const cached = this.cache.get(normalizedQuery);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const localResults = this.retrieveLocalKnowledge(normalizedQuery);

    if (!config.openai.apiKey || !config.pinecone.apiKey || !config.pinecone.indexName) {
      this.setCache(normalizedQuery, localResults);
      return localResults;
    }

    try {
      const results = await this.retrieveWithTimeout(normalizedQuery);

      const mapped = results.map((item) => ({
        id: item.id,
        name: item.name,
        text: item.text,
        link: item.link,
        type: item.type,
        category: item.category,
        source: "pinecone",
      }));

      const merged = this.mergeKnowledge(localResults, mapped);
      this.setCache(normalizedQuery, merged);
      return merged;
    } catch {
      this.setCache(normalizedQuery, localResults);
      return localResults;
    }
  }

  private async retrieveWithTimeout(query: string) {
    return await Promise.race([
      retrieveKnowledge({
        query,
        topK: 5,
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
    ]);
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

  private normalizeQueryForRetrieval(query: string): string {
    const normalized = query.trim().toLowerCase();
    const expansions: string[] = [];

    const synonymMap: Array<[RegExp, string[]]> = [
      [/\b(wazan|kitna gram|kitne gram)\b/i, ["weight", "size", "grams"]],
      [/\b(halaal|halal hain|halal hai)\b/i, ["halal", "certificate"]],
      [/\b(expiry kitni hai|kitni expiry)\b/i, ["expiry", "shelf life"]],
      [/\b(ingredients kya hain)\b/i, ["ingredients"]],
      [/\b(teekha|spicy chahiye)\b/i, ["spicy"]],
      [/\b(meetha|sweet chahiye)\b/i, ["sweet"]],
      [/\b(namkeen)\b/i, ["salty"]],
      [/\b(same day|advance pe|advance payment)\b/i, ["same day delivery", "advance payment"]],
      [/\b(pakistan mein delivery|pakistan me delivery|poore pakistan|saray pakistan)\b/i, ["delivery all over pakistan"]],
      [/\b(contact number|support number|whatsapp number)\b/i, ["contact support", "whatsapp"]],
      [/\b(refund|return|exchange)\b/i, ["refund", "return", "exchange"]],
      [/\b(kids|bachon|bache|school lunch)\b/i, ["kids", "school lunch", "kids fun box"]],
      [/\b(office|work|team)\b/i, ["office", "office snack box"]],
      [/\b(movie night|netflix|gaming|party snacks)\b/i, ["movie night", "gaming", "netflix", "movie night nachos bundle"]],
      [/\b(gift|gifting|corporate gifting)\b/i, ["gift", "gift box", "ultimate mega snack box"]],
      [/\b(bundle|combo|box|deal)\b/i, ["bundle", "combo", "deal", "value"]],
      [/\b(under 500|500 ke andar|rs\.?\s*500)\b/i, ["under_500", "budget"]],
      [/\b(under 1000|1000 ke andar|rs\.?\s*1000)\b/i, ["under_1000", "budget"]],
      [/\b(under 2000|2000 ke andar|rs\.?\s*2000)\b/i, ["under_2000", "budget"]],
      [/\b(above 3000|over 3000|rs\.?\s*3000)\b/i, ["above_3000", "budget"]],
    ];

    for (const [pattern, values] of synonymMap) {
      if (pattern.test(normalized)) {
        expansions.push(...values);
      }
    }

    return [normalized, ...expansions].join(" ").trim();
  }

  private retrieveLocalKnowledge(query: string): KnowledgeDocument[] {
    const capabilityResults = this.retrieveCapabilityKnowledge(query);
    const generalResults = this.retrieveGeneralKnowledge(query);
    const storeFaqResults = this.retrieveStoreFaqKnowledge(query);
    const snakitosGeneralTrainingResults = this.retrieveSnakitosGeneralTraining(query);
    const snakitosFaqResults = this.retrieveSnakitosFaqKnowledge(query);
    const snakitosRecommendationResults = this.retrieveSnakitosRecommendationKnowledge(query);
    const snakitosProductRecordResults = this.retrieveSnakitosProductRecordKnowledge(query);
    return this.mergeKnowledge(
      this.mergeKnowledge(
        this.mergeKnowledge(
          this.mergeKnowledge(
            this.mergeKnowledge(snakitosFaqResults, snakitosRecommendationResults),
            snakitosProductRecordResults,
          ),
          snakitosGeneralTrainingResults,
        ),
        this.mergeKnowledge(this.mergeKnowledge(storeFaqResults, capabilityResults), generalResults),
      ),
      [],
    );
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
          (/\b(delivery|shipping|courier|track|dispatch|cod|cash on delivery)\b/.test(query) &&
          /delivery|payment|order-support/.test(loweredCategory)
            ? 10
            : 0) +
          (/\b(expiry|shelf life|ingredients|weight|wazan|pack size|fresh)\b/.test(query) &&
          /product-facts|trust-support/.test(loweredCategory)
            ? 10
            : 0) +
          (/\b(contact|support|whatsapp|wholesale|bulk)\b/.test(query) &&
          /support|support-escalation/.test(loweredCategory)
            ? 10
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
    const docs = snakitosGeneralTrainingData as SnakitosGeneralTrainingItem[];

    return docs
      .map((item) => {
        const haystack = [
          item.user_query,
          item.ideal_answer,
          item.intent,
          item.language,
          ...(item.recommended_products ?? []),
          item.follow_up_question ?? "",
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
