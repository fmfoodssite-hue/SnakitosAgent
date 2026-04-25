import { AgentIntent } from "../types/chat.types";
import { extractOrderReference, extractPhoneNumber, normalizePhone } from "./validation.util";

const ORDER_KEYWORDS = [
  "order",
  "tracking",
  "track",
  "shipment",
  "shipping",
  "delivery",
  "where is my parcel",
  "where is my order",
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

  if (
    orderId ||
    normalizedPhone ||
    ORDER_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword))
  ) {
    return {
      intent: "order",
      orderId,
      phone: normalizedPhone,
    };
  }

  if (
    PRODUCT_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword)) ||
    PRODUCT_BROWSING_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return {
      intent: "product",
      orderId: "",
      phone: normalizedPhone,
    };
  }

  return {
    intent: "general",
    orderId: "",
    phone: normalizedPhone,
  };
}
