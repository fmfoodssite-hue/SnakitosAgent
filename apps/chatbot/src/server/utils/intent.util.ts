import { AgentIntent } from "../types/chat.types";
import { extractOrderReference, extractPhoneNumber, normalizePhone } from "./validation.util";

function normalizeIntentTypos(message: string): string {
  return message
    .toLowerCase()
    .replace(/\borde\b/g, "order")
    .replace(/\bproducy\b/g, "product")
    .replace(/\bproduc\b/g, "product");
}

const ORDER_KEYWORDS = [
  "track my order",
  "track order",
  "where is my order",
  "where is my order",
  "order status",
  "change address",
  "change my address",
  "cancel my order",
  "cancel order",
  "my order dispatched",
  "has my order been dispatched",
  "change my delivery address",
];

const POLICY_KEYWORDS = [
  "policy",
  "policies",
  "privacy",
  "terms",
  "service",
  "data",
  "collect",
  "sharing",
  "share",
  "cookie",
  "cookies",
  "return",
  "refund",
  "shipping",
  "delivery",
  "exchange",
  "cancel",
  "cancellation",
  "payment",
  "methods",
  "how to pay",
];

const GENERAL_KEYWORDS = [
  "about",
  "brand",
  "real store",
  "trust",
  "physical store",
  "store address",
  "location",
  "contact support",
  "support number",
  "whatsapp number",
  "contact number",
  "about snakitos",
  "what is snakitos",
  "brand ke bare",
  "brand ke bare mein",
  "support kaise",
  "support kese",
  "real ho",
  "real store ho",
  "store real hai",
  "ye store real hai",
  "official website",
  "official site",
  "who owns this brand",
  "what makes your store different",
  "physical shop",
  "courier",
  "track my parcel",
  "how do i track my parcel",
  "how can i track my parcel",
  "late delivery",
  "delivery late",
  "why is my delivery late",
  "delivry late",
  "wrong product",
  "return an item",
  "retrn an item",
  "opened items",
  "add item after ordering",
  "change address after order",
  "do i need account to order",
  "did not get confirmation",
  "order not placed",
  "payment deducted",
];

const PRODUCT_KEYWORDS = [
  "product",
  "products",
  "price",
  "available",
  "availability",
  "stock",
  "ingredient",
  "ingredients",
  "halal",
  "vegetarian",
  "vegan",
  "expiry",
  "fresh",
  "weight",
  "wazan",
  "gram",
  "grams",
  "imported",
  "local",
  "teekha",
  "meetha",
  "namkeen",
  "halaal",
  "gluten",
  "grain",
  "healthy",
  "healthwise",
  "diet",
  "flavor",
  "size",
  "buy",
  "snack",
  "snacks",
  "deal",
  "deals",
  "combo",
  "combos",
  "nachos",
  "chips",
  "bundle",
  "seller",
  "selling",
  "movie",
  "night",
  "craving",
  "cravings",
  "hunger",
  "hungry",
  "munch",
  "munching",
  "munchies",
  "bite",
  "bites",
  "tea",
  "evening",
  "midnight",
  "late",
  "recommend",
  "recommended",
  "suggest",
  "suggestion",
  "favorite",
  "favourite",
  "healthy",
  "healthwise",
  "health",
  "tasty",
  "crispy",
  "crunchy",
  "sweet",
  "salty",
  "spicy",
  "masala",
  "cheesy",
  "cheese",
  "paprika",
  "salsa",
  "peri",
  "hazelnut",
  "banana",
  "wafer",
  "wafers",
  "chocolate",
  "choco",
  "catalog",
  "sharing",
  "party",
  "gift",
  "gifts",
  "relative",
  "pack",
  "specials",
  "item",
  "items",
];

const PRODUCT_BROWSING_PATTERNS = [
  /best\s+seller/i,
  /best\s+selling/i,
  /best\s+for\s+movie/i,
  /best\s+for\s+sharing/i,
  /store\s+catalog/i,
  /store\s+specials/i,
  /store\s+best/i,
  /best\s+for\s+gift/i,
  /night\s+craving/i,
  /late\s+night/i,
  /late\s+night\s+snack/i,
  /tea\s*time/i,
  /gluten[\s-]*free/i,
  /wheat[\s-]*free/i,
  /health\s*wise/i,
  /healthy\s+snack/i,
  /multiple\s+grain/i,
  /multi\s+grain/i,
  /multigrain/i,
  /evening\s+snack/i,
  /midnight\s+snack/i,
  /something\s+(?:to|for)\s+eat/i,
  /what\s+should\s+i\s+eat/i,
  /health\s*wise/i,
  /healthy\s+snack/i,
  /healthy\s+option/i,
  /healthy\s+chips/i,
  /multi\s+grain/i,
  /recommend/i,
  /suggest/i,
  /gift/i,
  /party/i,
  /movie/i,
  /sharing/i,
];

const BUDGET_REPLY_PATTERN =
  /^(?:under|below|around|upto|up to|rs\.?|pkr)?\s*\d{3,5}(?:\s*(?:ke\s+andar|mein|me|under|rs|pkr))?\s*$/i;

export function detectIntent(message: string, phone?: string): {
  intent: AgentIntent;
  orderId: string;
  phone: string;
} {
  const normalizedMessage = normalizeIntentTypos(message);
  const trimmedMessage = message.trim();
  const orderId = extractOrderReference(message);
  const normalizedPhone = normalizePhone(phone) || extractPhoneNumber(message);
  const isStandaloneOrderLookupInput =
    Boolean(orderId || normalizedPhone) &&
    /^(?:check\s+)?(?:#?[a-z0-9-]{3,}|(?:\+?\d[\d\s\-()]{8,}\d))$/i.test(trimmedMessage);

  const hasOrderKeywords = ORDER_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword));
  const hasGeneralKeywords = GENERAL_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword));
  const hasProductKeywords = 
    PRODUCT_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword)) ||
    PRODUCT_BROWSING_PATTERNS.some((pattern) => pattern.test(message));
  const hasPolicyKeywords = POLICY_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword));
  const looksLikeBudgetReply = BUDGET_REPLY_PATTERN.test(normalizedMessage);

  // If user explicitly mentions order tracking keywords, it's an order intent.
  if (hasOrderKeywords) {
    return {
      intent: "order",
      orderId,
      phone: normalizedPhone,
    };
  }

  if (isStandaloneOrderLookupInput) {
    return {
      intent: "order",
      orderId,
      phone: normalizedPhone,
    };
  }

  if (hasGeneralKeywords) {
    return {
      intent: "general",
      orderId: "",
      phone: normalizedPhone,
    };
  }

  // Policy questions should win over product browsing when a message contains both.
  if (hasPolicyKeywords) {
    return {
      intent: "general",
      orderId: "",
      phone: normalizedPhone,
    };
  }

  // If user mentions product keywords, it's a product intent, even if a number (price) is present.
  if (hasProductKeywords) {
    return {
      intent: "product",
      orderId: "",
      phone: normalizedPhone,
    };
  }

  if (looksLikeBudgetReply) {
    return {
      intent: "general",
      orderId: "",
      phone: normalizedPhone,
    };
  }

  // Fallback: a clear order reference alone can imply order tracking.
  if (orderId) {
    return {
      intent: "order",
      orderId,
      phone: normalizedPhone,
    };
  }

  return {
    intent: "general",
    orderId: "",
    phone: normalizedPhone,
  };
}
