"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Bot,
  ChevronRight,
  CornerDownLeft,
  ExternalLink,
  Gift,
  House,
  Loader2,
  Mail,
  MessageCircle,
  Package,
  Phone,
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
  customerEmail?: string | null;
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

type ViewMode = "home" | "messages";

type SendRequest = {
  value: string;
  displayText?: string;
  silent?: boolean;
};

const STORE_HOME_URL = "https://snakitos.com/";
const STORE_PRODUCTS_URL = "https://snakitos.com/collections/all";

const COLLECTION_ACTIONS: Array<{ label: string; value: string; blurb: string; href: string }> = [
  {
    label: "Sweet Tooth",
    value: "Show me Sweet Tooth snacks",
    blurb: "Wafer rolls, choco sticks, and chocolate-forward favorites.",
    href: "https://snakitos.com/collections/sweet-tooth",
  },
  {
    label: "Multi Grain",
    value: "Show me Multi Grain snacks",
    blurb: "Stix, chickpea picks, and bolder crunchy flavors.",
    href: "https://snakitos.com/collections/multi-grain",
  },
  {
    label: "Banana Chips",
    value: "Show me Banana Chips",
    blurb: "Sea salt, BBQ, cheese, and achari masti choices.",
    href: "https://snakitos.com/collections/banana-chips",
  },
  {
    label: "Patata Chips",
    value: "Show me Patata Chips",
    blurb: "Masala and salty potato-slims style picks.",
    href: "https://snakitos.com/collections/patata-chips",
  },
  {
    label: "Deals",
    value: "show best deals",
    blurb: "Bundles, mega offers, can trays, and giftable value picks.",
    href: "https://snakitos.com/collections/deals",
  },
  {
    label: "Nachos",
    value: "Show me Nachos",
    blurb: "Paprika and salsa picks for movie-night style snacking.",
    href: "https://snakitos.com/collections/nachos",
  },
  {
    label: "Snaktory",
    value: "Show me Snaktory bundles",
    blurb: "Assorted snack packs and gifting-friendly combinations.",
    href: "https://snakitos.com/collections/snaktory",
  },
];

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

export default function PublicChatbot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: JSON.stringify({
        type: "mixed",
        message:
          "Hello there! I'm your Snakitos AI Assistant.\n\nAsk about snack collections, bundle deals, order tracking, or shipping policies. I can help in English or Urdu.",
      }),
    },
  ]);
  const [activeView, setActiveView] = useState<ViewMode>("home");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [chatId, setChatId] = useState("");
  const [phone, setPhone] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id = localStorage.getItem("chat_user_id");
    if (!id) {
      id = uuidv4();
      localStorage.setItem("chat_user_id", id);
    }
    setUserId(id);

    const existingChatId = localStorage.getItem("chat_id") || "";
    if (existingChatId) {
      setChatId(existingChatId);
    }

    const existingPhone = localStorage.getItem("chat_phone") || "";
    if (existingPhone) {
      setPhone(existingPhone);
    }
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
      window.location.href = STORE_HOME_URL;
      return;
    }

    setActiveView("messages");

    const displayText =
      typeof request === "string"
        ? request
        : request?.displayText ?? request?.value ?? messageToSend;
    const silent = typeof request === "object" ? Boolean(request.silent) : false;

    const detectedPhone = extractPhoneNumber(messageToSend) || phone;
    if (detectedPhone) {
      setPhone(detectedPhone);
      localStorage.setItem("chat_phone", detectedPhone);
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
        body: JSON.stringify({ message: messageToSend, userId, chatId, phone: detectedPhone }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();
      if (data.chatId) {
        setChatId(data.chatId);
        localStorage.setItem("chat_id", data.chatId);
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
                        {product.price ? <span>PKR {product.price}</span> : null}
                      </div>
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
    <main className={styles.page}>
      <div className={styles.shellWrap}>
        <section className={styles.chatShell}>
          <header className={styles.chatHeader}>
            <div className={styles.chatIdentity}>
              <div className={styles.botBadge}>
                <span>Sn</span>
              </div>
              <div>
                <h1>Snakitos AI Assistant</h1>
                <p>How can I help you today?</p>
              </div>
            </div>
            <a
              href={STORE_PRODUCTS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.headerLink}
            >
              Shop
            </a>
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

  const bareDigits = withoutPhones.match(/\b(\d{4,})\b/);
  return bareDigits ? `#${bareDigits[1]}` : "";
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

function renderOrderSummary(order: OrderSummary): React.ReactNode {
  const trackingEntries = (order.tracking ?? []).filter(
    (entry) => entry.number || entry.company || entry.url || entry.status,
  );
  const contactRows = getOrderContactRows(order);
  const orderItems = Array.isArray(order.lineItems) ? order.lineItems : [];
  const totalQuantity = orderItems.reduce(
    (sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0),
    0,
  );
  const displayItemCount = totalQuantity || orderItems.length;
  const fulfillmentLabel = formatStatusLabel(order.fulfillmentStatus) || "Pending";
  const paymentLabel = formatStatusLabel(order.financialStatus) || "Pending";

  return (
    <section className={styles.orderCard}>
      <div className={styles.orderHero}>
        <div className={styles.orderHeroCopy}>
          <span className={styles.orderEyebrow}>Order Summary</span>
          <h3>{order.orderName || (order.orderNumber ? `Order #${order.orderNumber}` : "Order details")}</h3>
          <p>
            {trackingEntries.length > 0
              ? "Tracking details are ready below."
              : "Tracking will appear here once the shipment is created."}
          </p>
        </div>

        {order.totalAmount ? (
          <div className={styles.orderTotalCard}>
            <span>Total</span>
            <strong>{formatCurrency(order.totalAmount, order.currencyCode)}</strong>
          </div>
        ) : null}
      </div>

      <div className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <span className={styles.statusLabel}>Fulfillment</span>
          <span
            className={`${styles.statusPill} ${getStatusToneClass(order.fulfillmentStatus)}`}
          >
            {fulfillmentLabel}
          </span>
        </div>

        <div className={styles.statusCard}>
          <span className={styles.statusLabel}>Payment</span>
          <span className={`${styles.statusPill} ${getStatusToneClass(order.financialStatus)}`}>
            {paymentLabel}
          </span>
        </div>
      </div>

      <div className={styles.orderInfoGrid}>
        <div className={styles.infoTile}>
          <div className={styles.infoTileHeader}>
            <span className={styles.infoTileIcon}>
              <User size={15} />
            </span>
            <span>Customer</span>
          </div>
          <strong>{order.customerName || "Not provided"}</strong>
          <p>{order.orderNumber ? `Reference #${order.orderNumber}` : "Order reference available above."}</p>
        </div>

        <div className={styles.infoTile}>
          <div className={styles.infoTileHeader}>
            <span className={styles.infoTileIcon}>
              <Phone size={15} />
            </span>
            <span>Contact</span>
          </div>
          {contactRows.length > 0 ? (
            <div className={styles.infoList}>
              {contactRows.map((row) => (
                <div key={`${row.label}-${row.value}`} className={styles.infoRow}>
                  <span className={styles.infoRowIcon}>
                    {row.kind === "email" ? <Mail size={14} /> : <Phone size={14} />}
                  </span>
                  <div className={styles.infoRowText}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <strong>Not available</strong>
              <p>No customer contact was returned for this order.</p>
            </>
          )}
        </div>

        <div className={styles.infoTile}>
          <div className={styles.infoTileHeader}>
            <span className={styles.infoTileIcon}>
              <Truck size={15} />
            </span>
            <span>Tracking</span>
          </div>
          {trackingEntries.length > 0 ? (
            <div className={styles.infoList}>
              {trackingEntries.map((entry, index) => (
                <div
                  key={`${entry.number || entry.url || entry.company || "tracking"}-${index}`}
                  className={styles.infoRow}
                >
                  <span className={styles.infoRowIcon}>
                    <Package size={14} />
                  </span>
                  <div className={styles.infoRowText}>
                    <span>{entry.company || `Shipment ${index + 1}`}</span>
                    <strong>{entry.number || "Tracking pending"}</strong>
                    {entry.status ? <p>{formatStatusLabel(entry.status)}</p> : null}
                    {entry.url ? (
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.trackingLink}
                      >
                        Track shipment
                        <ExternalLink size={12} />
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <strong>Pending after shipment</strong>
              <p>The courier number will show up here as soon as the order is fulfilled.</p>
            </>
          )}
        </div>
      </div>

      {orderItems.length > 0 ? (
        <div className={styles.orderItemsSection}>
          <div className={styles.orderItemsHeader}>
            <div>
              <span className={styles.orderEyebrow}>Order Items</span>
              <h4>{`${displayItemCount} item${displayItemCount === 1 ? "" : "s"} in this order`}</h4>
            </div>
          </div>

          <div className={styles.orderItemList}>
            {orderItems.map((item, index) => {
              const itemMeta = [item.variantTitle, item.sku ? `SKU ${item.sku}` : ""]
                .filter(Boolean)
                .join(" • ");

              return (
                <div key={`${item.title}-${index}`} className={styles.orderItemCard}>
                  <div className={styles.orderItemTop}>
                    <strong>{item.title}</strong>
                    <span className={styles.orderQty}>x{item.quantity}</span>
                  </div>
                  <p>{itemMeta || "Standard order item"}</p>
                  {item.total ? (
                    <div className={styles.orderItemFooter}>
                      <span className={styles.orderItemTotal}>
                        {formatCurrency(item.total, item.currencyCode)}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function getOrderContactRows(
  order: OrderSummary,
): Array<{ label: string; value: string; kind: "phone" | "email" }> {
  const rows: Array<{ label: string; value: string; kind: "phone" | "email" }> = [];

  if (order.customerPhone) {
    rows.push({ label: "Phone", value: order.customerPhone, kind: "phone" });
  }

  if (order.shippingPhone && order.shippingPhone !== order.customerPhone) {
    rows.push({ label: "Shipping phone", value: order.shippingPhone, kind: "phone" });
  }

  if (order.customerEmail) {
    rows.push({ label: "Email", value: order.customerEmail, kind: "email" });
  }

  return rows;
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
