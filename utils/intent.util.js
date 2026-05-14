import { extractOrderReference, extractPhoneNumber, normalizePhone } from "./validation.util";
function normalizeIntentTypos(message) {
    return message
        .toLowerCase()
        .replace(/\borde\b/g, "order")
        .replace(/\bproducy\b/g, "product")
        .replace(/\bproduc\b/g, "product");
}
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
const BUDGET_REPLY_PATTERN = /^(?:under|below|around|upto|up to|rs\.?|pkr)?\s*\d{3,5}(?:\s*(?:ke\s+andar|mein|me|under|rs|pkr))?\s*$/i;
export function detectIntent(message, phone) {
    const normalizedMessage = normalizeIntentTypos(message);
    const orderId = extractOrderReference(message);
    const normalizedPhone = normalizePhone(phone) || extractPhoneNumber(message);
    const hasOrderKeywords = ORDER_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword));
    const looksLikeBudgetReply = BUDGET_REPLY_PATTERN.test(normalizedMessage);
    if ((orderId || hasOrderKeywords) && !(looksLikeBudgetReply && !hasOrderKeywords)) {
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
