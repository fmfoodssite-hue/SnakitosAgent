import { config } from "../config";
import { OrderLookupResult } from "../types/order.types";

export function normalizePhone(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  if (digits.startsWith("00")) {
    return digits.slice(2);
  }

  return digits;
}

export function extractPhoneNumber(value: string): string {
  const candidates = value.match(/(?:\+?\d[\d\s\-()]{8,}\d)/g) ?? [];
  const normalized = candidates
    .map((candidate) => normalizePhone(candidate))
    .filter((candidate) => candidate.length >= 10);

  return normalized[0] ?? "";
}

export function comparePhoneNumbers(left: string, right: string): boolean {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

  return a.slice(-10) === b.slice(-10);
}

export function normalizeOrderReference(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function extractNumericOrderId(value: string): string {
  const match = value.match(/\d+/);
  return match?.[0] ?? "";
}

export function extractOrderReference(message: string): string {
  const withoutPhones = message.replace(/(?:\+?\d[\d\s\-()]{8,}\d)/g, " ");

  const explicitHash = withoutPhones.match(/#\s*([A-Z0-9-]{3,})/i);
  if (explicitHash) {
    return normalizeOrderReference(`#${explicitHash[1]}`);
  }

  const orderPhrase = withoutPhones.match(
    /\b(?:order(?:\s*(?:id|number|no\.?))?|id|tracking(?:\s*id)?)\s*[:#-]?\s*([A-Z0-9-]{3,})/i,
  );
  if (orderPhrase) {
    const raw = orderPhrase[1];
    if (/^\d+$/.test(raw)) {
      return `#${raw}`;
    }
    return normalizeOrderReference(raw.startsWith("#") ? raw : `#${raw}`);
  }

  const reverseOrderPhrase = withoutPhones.match(
    /\b([A-Z0-9-]{3,})\s*(?:order(?:\s*(?:id|number|no\.?))?|tracking(?:\s*id)?|id)\b/i,
  );
  if (reverseOrderPhrase) {
    const raw = reverseOrderPhrase[1];
    return /^\d+$/.test(raw) ? `#${raw}` : normalizeOrderReference(raw.startsWith("#") ? raw : `#${raw}`);
  }

  const bareDigits = withoutPhones.match(/\b(\d{4,})\b/);
  return bareDigits ? `#${bareDigits[1]}` : "";
}

export function compareOrderReference(order: OrderLookupResult, provided: string): boolean {
  const normalizedProvided = normalizeOrderReference(provided);
  const numericProvided = extractNumericOrderId(normalizedProvided);
  const candidates = [
    normalizeOrderReference(order.orderName),
    normalizeOrderReference(order.orderNumber),
    order.orderNumber.startsWith("#") ? order.orderNumber : `#${order.orderNumber}`,
  ];

  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeOrderReference(candidate);
    return (
      normalizedCandidate === normalizedProvided ||
      extractNumericOrderId(normalizedCandidate) === numericProvided
    );
  });
}

export function extractProductQuery(message: string): string {
  const cleaned = message
    .toLowerCase()
    .replace(
      /\b(hey|hi|hello|please|okay|ok|i want|i need|show me|give me|tell me|details|detail|about|of the|from the|in the|for the|what is|what are|do you have|can you|could you|share|know|information|info|available|availability|stock|this|that|those|thos|item|items|product|products|best|top|recommend|recommended|suggest|suggestions|options|for me|should i|get me|something|good|nice)\b/gi,
      " ",
    )
    .replace(/[^a-z0-9\s&-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length >= 2 ? cleaned : "";
}

export function extractSelectionIndex(message: string): number | null {
  const match = message.trim().match(/^(\d+)\b/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function formatWhatsAppFallback(message: string): string {
  return `${message}\nPlease contact support on WhatsApp: ${config.app.whatsappNumber}`;
}
