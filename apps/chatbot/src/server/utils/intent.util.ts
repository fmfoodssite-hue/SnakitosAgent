import { AgentIntent } from "../types/chat.types";
import { extractOrderReference, extractPhoneNumber, normalizePhone } from "./validation.util";

const ORDER_KEYWORDS = [
  "tracking",
  "track",
  "shipment",
  "where is my parcel",
  "where is my order",
  "order status",
];

const POLICY_KEYWORDS = [
  "policy",
  "policies",
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

const PRODUCT_KEYWORDS = [
  "product",
  "products",
  "price",
  "available",
  "availability",
  "stock",
  "ingredient",
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
  "store",
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
  /evening\s+snack/i,
  /midnight\s+snack/i,
  /something\s+(?:to|for)\s+eat/i,
  /what\s+should\s+i\s+eat/i,
  /recommend/i,
  /suggest/i,
  /gift/i,
  /party/i,
  /movie/i,
  /sharing/i,
];

export function detectIntent(message: string, phone?: string): {
  intent: AgentIntent;
  orderId: string;
  phone: string;
} {
  const normalizedMessage = message.toLowerCase();
  const orderId = extractOrderReference(message);
  const normalizedPhone = normalizePhone(phone) || extractPhoneNumber(message);

  const hasOrderKeywords = ORDER_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword));
  const hasProductKeywords = 
    PRODUCT_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword)) ||
    PRODUCT_BROWSING_PATTERNS.some((pattern) => pattern.test(message));
  const hasPolicyKeywords = POLICY_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword));

  // If user explicitly mentions order tracking keywords, it's an order intent.
  if (hasOrderKeywords) {
    return {
      intent: "order",
      orderId,
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

  // If it's a policy keyword, return general (which covers policies).
  if (hasPolicyKeywords) {
    return {
      intent: "general",
      orderId: "",
      phone: normalizedPhone,
    };
  }

  // Fallback: If a valid order ID or phone is found but no keywords, assume order tracking.
  if (orderId || normalizedPhone) {
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
