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
  "price",
  "available",
  "availability",
  "stock",
  "ingredient",
  "flavor",
  "size",
  "buy",
];

export function detectIntent(message: string, phone?: string): {
  intent: AgentIntent;
  orderId: string;
  phone: string;
} {
  const normalizedMessage = message.toLowerCase();
  const orderId = extractOrderReference(message);
  const normalizedPhone = normalizePhone(phone) || extractPhoneNumber(message);

  if (orderId || ORDER_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword))) {
    return {
      intent: "order",
      orderId,
      phone: normalizedPhone,
    };
  }

  if (PRODUCT_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword))) {
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
