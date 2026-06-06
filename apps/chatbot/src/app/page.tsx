"use client";

import Image from "next/image";
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Bot,
  ChevronRight,
  CornerDownLeft,
  ExternalLink,
  Gift,
  House,
  Loader2,
  MessageCircle,
  Package,
  ScrollText,
  Send,
  ShoppingBag,
  Sparkles,
  Truck,
  User,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import styles from "./page.module.css";

interface Option {
  label: string;
  value: string;
}

interface Product {
  name: string;
  price?: string;
  description: string;
  link?: string;
  savings?: string;
}

interface OrderTracking {
  company?: string | null;
  number?: string | null;
  url?: string | null;
  status?: string | null;
}

interface OrderLineItem {
  title: string;
  quantity: number;
  sku?: string | null;
  variantTitle?: string | null;
  total?: string;
  currencyCode?: string;
}

interface OrderSummary {
  orderName?: string;
  orderNumber?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  shippingPhone?: string | null;
  financialStatus?: string;
  fulfillmentStatus?: string;
  totalAmount?: string;
  currencyCode?: string;
  tracking?: OrderTracking[];
  lineItems?: OrderLineItem[];
}

interface StructuredContent {
  type: "product" | "policy" | "mixed" | "fallback";
  message: string;
  products?: Product[];
  order?: OrderSummary;
  policy_link?: string;
  options?: Option[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ShopifyEmbedContext {
  shop?: string;
  brandName?: string;
  pageUrl?: string;
  pageTitle?: string;
  pageType?: string;
  cartCount?: number;
  product?: {
    id?: string | number;
    title?: string;
    handle?: string;
    url?: string;
    available?: boolean;
    price?: string | number;
  } | null;
  timestamp?: string;
}

type ViewMode = "home" | "messages";

type SendRequest = {
  value: string;
  displayText?: string;
  silent?: boolean;
};

const STORE_PRODUCTS_URL = "https://snakitos.com/collections/all";
const CHAT_SESSION_EVENT = "chat-session-change";

type ChatSessionSnapshot = {
  chatId: string;
  phone: string;
  userId: string;
};

const EMPTY_CHAT_SESSION: ChatSessionSnapshot = Object.freeze({
  chatId: "",
  phone: "",
  userId: "",
});
let cachedChatSessionSnapshot: ChatSessionSnapshot = EMPTY_CHAT_SESSION;

const HOME_SHORTCUTS: Array<{
  label: string;
  value: string;
  blurb: string;
  icon: "order" | "deals" | "collections" | "policy";
}> = [
  {
    label: "Track Order",
    value: "track my order",
    blurb: "Check courier details, shipping status, and delivery updates.",
    icon: "order",
  },
  {
    label: "Snack Deals",
    value: "show best deals",
    blurb: "See bundle offers, gifting picks, and the best current value packs.",
    icon: "deals",
  },
  {
    label: "Shop Collections",
    value: "show categories",
    blurb: "Browse Sweet Tooth, Multi Grain, Banana Chips, Nachos, and more.",
    icon: "collections",
  },
  {
    label: "Shipping & Refunds",
    value: "show shipping and refund policy",
    blurb: "Get clear answers about delivery timing, refunds, and store policies.",
    icon: "policy",
  },
];

function getEmptyChatSession(): ChatSessionSnapshot {
  return EMPTY_CHAT_SESSION;
}

function readChatSessionSnapshot(): ChatSessionSnapshot {
  if (typeof window === "undefined") {
    return getEmptyChatSession();
  }

  const nextSnapshot = {
    chatId: window.localStorage.getItem("chat_id") || "",
    phone: window.localStorage.getItem("chat_phone") || "",
    userId: window.localStorage.getItem("chat_user_id") || "",
  };

  if (
    cachedChatSessionSnapshot.chatId === nextSnapshot.chatId &&
    cachedChatSessionSnapshot.phone === nextSnapshot.phone &&
    cachedChatSessionSnapshot.userId === nextSnapshot.userId
  ) {
    return cachedChatSessionSnapshot;
  }

  cachedChatSessionSnapshot = nextSnapshot;
  return cachedChatSessionSnapshot;
}

function subscribeToChatSession(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(CHAT_SESSION_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(CHAT_SESSION_EVENT, handleChange);
  };
}

function writeChatSession(update: Partial<ChatSessionSnapshot>): void {
  if (typeof window === "undefined") {
    return;
  }

  if (typeof update.userId === "string") {
    if (update.userId) {
      window.localStorage.setItem("chat_user_id", update.userId);
    } else {
      window.localStorage.removeItem("chat_user_id");
    }
  }

  if (typeof update.chatId === "string") {
    if (update.chatId) {
      window.localStorage.setItem("chat_id", update.chatId);
    } else {
      window.localStorage.removeItem("chat_id");
    }
  }

  if (typeof update.phone === "string") {
    if (update.phone) {
      window.localStorage.setItem("chat_phone", update.phone);
    } else {
      window.localStorage.removeItem("chat_phone");
    }
  }

  window.dispatchEvent(new Event(CHAT_SESSION_EVENT));
}

export default function PublicChatbot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: JSON.stringify({
        type: "mixed",
        message:
          "Hi! I’m the Snakitos AI Assistant. I can help you track orders, find snack deals, recommend snacks by taste or budget, and answer questions about delivery, payments, and refunds. What are you craving today — spicy, sweet, crunchy, or a mixed snack box?",
      }),
    },
  ]);
  const [isEmbedded] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const params = new URLSearchParams(window.location.search);
    return params.get("embedded") === "1" || window.self !== window.top;
  });
  const [embedContext, setEmbedContext] = useState<ShopifyEmbedContext | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return readEmbedContextFromUrl(new URLSearchParams(window.location.search));
  });
  const chatSession = useSyncExternalStore(
    subscribeToChatSession,
    readChatSessionSnapshot,
    getEmptyChatSession,
  );
  const [activeView, setActiveView] = useState<ViewMode>("home");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatSession.userId) {
      writeChatSession({ userId: uuidv4() });
    }
  }, [chatSession.userId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || typeof payload !== "object" || payload.type !== "SHOPIFY_RAG_CONTEXT") {
        return;
      }

      setEmbedContext((payload.payload as ShopifyEmbedContext) ?? null);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    if (activeView === "messages") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      return;
    }

    scrollRef.current.scrollTop = 0;
  }, [activeView, messages]);

  const handleSend = async (request?: string | SendRequest) => {
    const messageToSend =
      typeof request === "string" ? request : request?.value || input.trim();
    if (!messageToSend || loading) {
      return;
    }

    if (messageToSend.toLowerCase() === "home") {
      setActiveView("home");
      return;
    }

    setActiveView("messages");

    const displayText =
      typeof request === "string"
        ? request
        : request?.displayText ?? request?.value ?? messageToSend;
    const silent = typeof request === "object" ? Boolean(request.silent) : false;
    const effectiveUserId = chatSession.userId || uuidv4();

    if (!chatSession.userId) {
      writeChatSession({ userId: effectiveUserId });
    }

    const detectedPhone = extractPhoneNumber(messageToSend) || chatSession.phone;
    if (detectedPhone) {
      writeChatSession({ phone: detectedPhone });
    }

    if (!request) {
      setInput("");
    }

    if (!silent) {
      setMessages((prev) => [...prev, { role: "user", content: displayText }]);
    }
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: messageToSend,
          userId: effectiveUserId,
          chatId: chatSession.chatId,
          phone: detectedPhone,
        }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();
      if (data.chatId) {
        writeChatSession({ chatId: data.chatId });
      }

      if (data.response) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
      }
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePreset = (value: string, label: string) => {
    void handleSend({
      value,
      displayText: buildAutoClickText(value, label),
    });
  };

  const renderOptions = (options: Option[]) => (
    <div className={styles.optionRow}>
      {ensureNavigationOptions(options).map((option) => (
        <button
          key={`${option.label}-${option.value}`}
          onClick={() => handlePreset(option.value, option.label)}
          className={styles.optionChip}
        >
          {option.label === "Back" ? <CornerDownLeft size={12} /> : null}
          {option.label === "Home" ? <House size={12} /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );

  const renderAssistantMessage = (content: string, showActions: boolean) => {
    try {
      if (content.trim().startsWith("{")) {
        const parsed = JSON.parse(content) as StructuredContent;
        return (
          <div className={styles.assistantContent}>
            {parsed.order ? renderOrderSummary(parsed.order) : renderParagraphText(parsed.message)}

            {parsed.products && parsed.products.length > 0 ? (
              <div className={styles.productList}>
                {parsed.products.map((product, index) => (
                  <div key={`${product.name}-${index}`} className={styles.productCard}>
                    <div className={styles.productIcon}>
                      <ShoppingBag size={18} />
                    </div>
                    <div className={styles.productMeta}>
                      <div className={styles.productTopRow}>
                        <h4>{product.name}</h4>
                        {product.price ? <span>{formatProductPrice(product.price)}</span> : null}
                      </div>
                      {product.savings ? (
                        <div className={styles.savingsBadge}>
                          Save PKR {product.savings} on this purchase
                        </div>
                      ) : null}
                      <p>{product.description}</p>
                      <a
                        href={product.link || STORE_PRODUCTS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.productLink}
                      >
                        Open on Snakitos
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {parsed.policy_link ? (
              <a
                href={parsed.policy_link}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.policyLink}
              >
                View policy on Snakitos
                <ExternalLink size={12} />
              </a>
            ) : null}

            {showActions
              ? parsed.options && parsed.options.length > 0
                ? renderOptions(parsed.options)
                : parsed.order || parsed.products?.length || parsed.policy_link
                  ? renderOptions([])
                  : null
              : null}
          </div>
        );
      }
    } catch {
      return (
        <div className={styles.assistantContent}>
          {renderParagraphText(content)}
          {showActions ? renderOptions([]) : null}
        </div>
      );
    }

    return (
      <div className={styles.assistantContent}>
        {renderParagraphText(content)}
        {showActions ? renderOptions([]) : null}
      </div>
    );
  };

  return (
    <main className={`${styles.page} ${isEmbedded ? styles.pageEmbedded : ""}`}>
      <div className={`${styles.shellWrap} ${isEmbedded ? styles.shellWrapEmbedded : ""}`}>
        <section className={`${styles.chatShell} ${isEmbedded ? styles.chatShellEmbedded : ""}`}>
          <header className={styles.chatHeader}>
            <div className={styles.chatIdentity}>
              <div className={styles.botBadge}>
                <Image
                  src="/Snakitos_Logo.png"
                  alt="Snakitos"
                  width={220}
                  height={72}
                  className={styles.botLogo}
                  priority
                />
              </div>
              <div>
                <h1>How can I help you today?</h1>
                <p>{resolveSubtitle(embedContext, isEmbedded)}</p>
              </div>
            </div>
          </header>

          <div ref={scrollRef} className={styles.chatBody}>
            {activeView === "home" ? (
              <div className={styles.homeView}>
                <div className={styles.shortcutList}>
                  {HOME_SHORTCUTS.map((shortcut) => (
                    <button
                      key={shortcut.label}
                      onClick={() => handlePreset(shortcut.value, shortcut.label)}
                      className={styles.shortcutCard}
                    >
                      <span className={styles.shortcutIcon}>
                        {renderShortcutIcon(shortcut.icon)}
                      </span>
                      <span className={styles.shortcutCopy}>
                        <strong>{shortcut.label}</strong>
                      </span>
                      <ChevronRight size={20} className={styles.shortcutArrow} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.messagesView}>
                {messages.map((message, index) =>
                  (() => {
                    const isLatestAssistant =
                      message.role === "assistant" &&
                      messages.findLastIndex((item) => item.role === "assistant") === index;

                    return (
                      <div
                        key={index}
                        className={
                          message.role === "user"
                            ? styles.messageRowUser
                            : styles.messageRowAssistant
                        }
                      >
                        <div
                          className={
                            message.role === "user"
                              ? styles.avatarUser
                              : styles.avatarAssistant
                          }
                        >
                          {message.role === "user" ? <User size={14} /> : <Bot size={14} />}
                        </div>
                        <div
                          className={
                            message.role === "user"
                              ? styles.userBubble
                              : styles.assistantBubble
                          }
                        >
                          {message.role === "assistant"
                            ? renderAssistantMessage(message.content, isLatestAssistant)
                            : renderUserMessage(message.content)}
                        </div>
                      </div>
                    );
                  })(),
                )}

                {loading ? (
                  <div className={styles.messageRowAssistant}>
                    <div className={styles.avatarAssistant}>
                      <Loader2 size={14} className={styles.spinner} />
                    </div>
                    <div className={styles.loadingBubble}>Checking Snakitos...</div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className={styles.chatFooter}>
            <div className={styles.inputWrap}>
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSend()}
                placeholder="Message..."
                className={styles.input}
              />
              <button
                onClick={() => handleSend()}
                disabled={loading}
                className={styles.sendButton}
              >
                <Send size={18} />
              </button>
            </div>
          </div>

          <nav className={styles.bottomNav}>
            <button
              type="button"
              onClick={() => setActiveView("home")}
              className={`${styles.navButton} ${
                activeView === "home" ? styles.navButtonActive : ""
              }`}
            >
              <House size={18} />
              <span>Home</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView("messages")}
              className={`${styles.navButton} ${
                activeView === "messages" ? styles.navButtonActive : ""
              }`}
            >
              <MessageCircle size={18} />
              <span>Messages</span>
            </button>
          </nav>
        </section>
      </div>
    </main>
  );
}

function readEmbedContextFromUrl(searchParams: URLSearchParams): ShopifyEmbedContext | null {
  const hasShopifyContext =
    searchParams.get("source") === "shopify" ||
    searchParams.get("shop") ||
    searchParams.get("product_title");

  if (!hasShopifyContext) {
    return null;
  }

  return {
    shop: searchParams.get("shop") ?? undefined,
    pageUrl: searchParams.get("page_url") ?? undefined,
    pageTitle: searchParams.get("page_title") ?? undefined,
    pageType: searchParams.get("page_type") ?? undefined,
    cartCount: searchParams.get("cart_count")
      ? Number(searchParams.get("cart_count"))
      : undefined,
    product: searchParams.get("product_title")
      ? {
          id: searchParams.get("product_id") ?? undefined,
          handle: searchParams.get("product_handle") ?? undefined,
          title: searchParams.get("product_title") ?? undefined,
        }
      : null,
  };
}

function resolveSubtitle(
  context: ShopifyEmbedContext | null,
  isEmbedded: boolean,
): string {
  if (context?.product?.title) {
    return `Snakitos support for ${context.product.title}, delivery, and order help.`;
  }

  if (context?.pageType === "product") {
    return "Product questions, delivery updates, and order support.";
  }

  if (context?.pageType === "cart") {
    return "Checkout guidance, delivery questions, and order support.";
  }

  if (isEmbedded) {
    return "Snakitos Customer, delivery, and order support.";
  }

  return "Snakitos Customer, delivery, and order support.";
}

function extractPhoneNumber(value: string): string {
  const candidates = value.match(/(?:\+?\d[\d\s\-()]{8,}\d)/g) ?? [];
  const normalized = candidates
    .map((candidate) => candidate.replace(/\D/g, ""))
    .filter((candidate) => candidate.length >= 10);

  return normalized[0] ?? "";
}

function extractOrderReference(value: string): string {
  const withoutPhones = value.replace(/(?:\+?\d[\d\s\-()]{8,}\d)/g, " ");
  const explicitHash = value.match(/#\s*([A-Z0-9-]{3,})/i);
  if (explicitHash) {
    return `#${explicitHash[1]}`;
  }

  const orderPhrase = value.match(
    /\b(?:order(?:\s*(?:id|number|no\.?))?|id|tracking(?:\s*id)?)\s*[:#-]?\s*([A-Z0-9-]{3,})/i,
  );
  if (orderPhrase) {
    return orderPhrase[1].startsWith("#") ? orderPhrase[1] : `#${orderPhrase[1]}`;
  }

  const hasOrderContext = /\b(order|tracking|track|parcel|shipment)\b/i.test(value);
  const bareDigits = withoutPhones.match(/\b(\d{4,})\b/);
  return hasOrderContext && bareDigits ? `#${bareDigits[1]}` : "";
}

function buildAutoClickText(value: string, fallbackLabel: string): string {
  const normalizedValue = value.trim();
  const normalizedLabel = fallbackLabel.trim();

  if (/^show categories$/i.test(normalizedValue)) {
    return /^back$/i.test(normalizedLabel)
      ? "Take me back to the main snack categories."
      : "Show me the main snack collections.";
  }

  if (/^show best deals$/i.test(normalizedValue)) {
    return "Show me the best snack deals available right now.";
  }

  if (/^show gift packs$/i.test(normalizedValue)) {
    return "Show me gift packs and bundle options.";
  }

  if (/^track my order$/i.test(normalizedValue)) {
    return "I want to check my order status.";
  }

  if (/^show shipping and refund policy$/i.test(normalizedValue)) {
    return "Show me the shipping and refund policy.";
  }

  if (/^show me /i.test(normalizedValue)) {
    const sentence = normalizedValue.replace(/\s+/g, " ").trim();
    return sentence.endsWith(".") ? sentence : `${sentence}.`;
  }

  if (/^home$/i.test(normalizedValue)) {
    return "Take me to the home page.";
  }

  if (normalizedLabel) {
    return `Show me ${normalizedLabel.toLowerCase()}.`;
  }

  return normalizedValue;
}

function ensureNavigationOptions(options: Option[]): Option[] {
  const items = [...options];

  if (!items.some((option) => option.label === "Back")) {
    items.push({ label: "Back", value: "show categories" });
  }

  if (!items.some((option) => option.label === "Home")) {
    items.push({ label: "Home", value: "home" });
  }

  return items;
}

function renderParagraphText(content: string): React.ReactNode {
  const blocks = content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, index) => (
    <p key={`${block}-${index}`} className={styles.assistantText}>
      {block.replace(/\n/g, " ")}
    </p>
  ));
}

function renderUserMessage(content: string): React.ReactNode {
  const display = formatUserMessageDisplay(content);

  if (display.kind === "order_lookup") {
    return (
      <div className={styles.userMessageCard}>
        <span className={styles.userMessageEyebrow}>Order Lookup</span>
        <strong className={styles.userMessageTitle}>{display.title}</strong>
        {display.detail ? <span className={styles.userMessageDetail}>{display.detail}</span> : null}
      </div>
    );
  }

  return <p className={styles.userMessageText}>{content}</p>;
}

function formatUserMessageDisplay(content: string):
  | { kind: "plain" }
  | { kind: "order_lookup"; title: string; detail?: string } {
  const normalized = content.trim();
  const orderId = extractOrderReference(normalized);
  const phone = extractPhoneNumber(normalized);
  const hasSpecificOrderReference = Boolean(orderId && /\d/.test(orderId));
  const isOrderLookup = hasSpecificOrderReference || Boolean(phone);

  if (!isOrderLookup) {
    return { kind: "plain" };
  }

  const title = hasSpecificOrderReference ? `Check ${orderId}` : "Check order";
  const detail = phone ? `Phone ending ${phone.slice(-4)}` : undefined;

  return {
    kind: "order_lookup",
    title,
    detail,
  };
}

function formatProductPrice(price?: string): string {
  const trimmed = price?.trim() || "";
  if (!trimmed) {
    return "";
  }

  return /^\d/.test(trimmed) ? `PKR ${trimmed}` : trimmed;
}

function formatOrderHeading(order: OrderSummary): string {
  const rawHeading = order.orderName?.trim() || "";
  if (rawHeading) {
    return rawHeading.startsWith("#") ? `Order ${rawHeading}` : rawHeading;
  }

  return order.orderNumber ? `Order #${order.orderNumber}` : "Order details";
}

function renderOrderSummary(order: OrderSummary): React.ReactNode {
  const trackingEntries = (order.tracking ?? []).filter(
    (entry) => entry.number || entry.company || entry.url || entry.status,
  );
  const primaryTracking = trackingEntries[0] ?? null;
  const customerName = order.customerName || "Not available";
  const orderNumber = order.orderNumber ? `#${order.orderNumber}` : "Not available";
  const trackingNumber = primaryTracking?.number || "Not available";
  const trackingLink = primaryTracking?.url || "";

  return (
    <section className={styles.orderCard}>
      <div className={styles.orderHero}>
        <div className={styles.orderHeroCopy}>
          <span className={styles.orderEyebrow}>Order Summary</span>
          <h3>{formatOrderHeading(order)}</h3>
          <p>Customer details and tracking link.</p>
        </div>
      </div>

      <div className={styles.orderSimpleCard}>
        <div className={styles.orderSimpleRow}>
          <span>Name</span>
          <strong>{customerName}</strong>
        </div>

        <div className={styles.orderSimpleRow}>
          <span>Order No</span>
          <strong>{orderNumber}</strong>
        </div>

        <div className={styles.orderSimpleRow}>
          <span>Tracking No</span>
          <strong>{trackingNumber}</strong>
        </div>

        <div className={styles.orderSimpleRow}>
          <span>Link</span>
          {trackingLink ? (
            <a
              href={trackingLink}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.trackingButton}
            >
              Open tracking link
              <ExternalLink size={14} />
            </a>
          ) : (
            <strong>Not available</strong>
          )}
        </div>
      </div>
    </section>
  );
}
function formatCurrency(amount?: string, currencyCode?: string): string {
  if (!amount) {
    return "";
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return `${currencyCode ? `${currencyCode} ` : ""}${amount}`.trim();
  }

  try {
    return new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency: currencyCode || "PKR",
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    return `${currencyCode ? `${currencyCode} ` : ""}${amount}`.trim();
  }
}

function formatStatusLabel(value?: string | null): string {
  if (!value) {
    return "";
  }

  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusToneClass(value?: string | null): string {
  const normalized = value?.toLowerCase() ?? "";

  if (
    normalized.includes("pending") ||
    normalized.includes("unfulfilled") ||
    normalized.includes("partial") ||
    normalized.includes("in transit")
  ) {
    return styles.statusWarning;
  }

  if (
    normalized.includes("paid") ||
    normalized.includes("fulfilled") ||
    normalized.includes("delivered")
  ) {
    return styles.statusSuccess;
  }

  return styles.statusNeutral;
}

function renderShortcutIcon(icon: "order" | "deals" | "collections" | "policy") {
  switch (icon) {
    case "order":
      return <Package size={18} />;
    case "deals":
      return <Gift size={18} />;
    case "collections":
      return <Sparkles size={18} />;
    case "policy":
      return <ScrollText size={18} />;
    default:
      return <ShoppingBag size={18} />;
  }
}

