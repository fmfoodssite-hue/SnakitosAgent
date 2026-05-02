"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Bot,
  CornerDownLeft,
  ExternalLink,
  Gift,
  House,
  Loader2,
  Package,
  ScrollText,
  Send,
  ShoppingBag,
  Sparkles,
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

interface StructuredContent {
  type: "product" | "policy" | "mixed" | "fallback";
  message: string;
  products?: Product[];
  policy_link?: string;
  options?: Option[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

type SendRequest = {
  value: string;
  displayText?: string;
  silent?: boolean;
};

const STORE_HOME_URL = "https://snakitos.com/";
const STORE_PRODUCTS_URL = "https://snakitos.com/collections/all";
const STORE_POLICIES_URL = "https://snakitos.com/policies/";

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

const QUICK_ACTIONS: Option[] = [
  { label: "Collections", value: "show categories" },
  { label: "Deals", value: "show best deals" },
  { label: "Bundles", value: "show gift packs" },
  { label: "Track Order", value: "track my order" },
  { label: "Policies", value: "show shipping and refund policy" },
];

const STOREFRONT_LINKS = [
  { label: "Home", href: STORE_HOME_URL },
  { label: "Search", href: "https://snakitos.com/search" },
  { label: "Cart", href: "https://snakitos.com/cart" },
  { label: "Contact", href: "https://snakitos.com/pages/contact" },
];

export default function PublicChatbot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: JSON.stringify({
        type: "mixed",
        message:
          "Welcome to Snakitos. I can help with products, orders, policies, and general store guidance.",
        options: [
          { label: "Deals", value: "show best deals" },
          { label: "Sweet Tooth", value: "Show me Sweet Tooth snacks" },
          { label: "Multi Grain", value: "Show me Multi Grain snacks" },
          { label: "Track Order", value: "track my order" },
          { label: "Home", value: "home" },
        ],
      }),
    },
  ]);
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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

  const renderOptions = (options: Option[]) => (
    <div className={styles.optionRow}>
      {ensureNavigationOptions(options).map((option) => (
        <button
          key={`${option.label}-${option.value}`}
          onClick={() =>
            handleSend({
              value: option.value,
              displayText: option.label,
              silent: true,
            })
          }
          className={styles.optionChip}
        >
          {option.label === "Back" ? <CornerDownLeft size={12} /> : null}
          {option.label === "Home" ? <House size={12} /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );

  const renderAssistantMessage = (content: string) => {
    try {
      if (content.trim().startsWith("{")) {
        const parsed = JSON.parse(content) as StructuredContent;
        return (
          <div className={styles.assistantContent}>
            {renderParagraphText(parsed.message)}

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

            {renderOptions(parsed.options ?? [])}
          </div>
        );
      }
    } catch {
      return (
        <div className={styles.assistantContent}>
          {renderParagraphText(content)}
          {renderOptions([])}
        </div>
      );
    }

    return (
      <div className={styles.assistantContent}>
        {renderParagraphText(content)}
        {renderOptions([])}
      </div>
    );
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <section className={styles.topbar}>
          <div className={styles.topbarBrand}>
            <span className={styles.brandChip}>Snakitos</span>
            <p>Public support assistant</p>
          </div>
          <div className={styles.topbarActions}>
            <a
              href={STORE_HOME_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.topbarLink}
            >
              Visit Store
            </a>
            <a
              href={STORE_PRODUCTS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.topbarLinkMuted}
            >
              All Products
            </a>
          </div>
        </section>

        <section className={styles.heroCard}>
          <div className={styles.heroCopy}>
            <div className={styles.badges}>
              <span>Pakistani Snacks</span>
              <span>Category-led Help</span>
            </div>
            <h1>Shop Snakitos faster with a mobile-first snack concierge.</h1>
            <p>
              Explore Sweet Tooth, Multi Grain, Banana Chips, Patata Chips, Deals,
              Nachos, Snaktory, policies, and order support from one chat flow.
            </p>
          </div>

          <div className={styles.heroActions}>
            <button
              onClick={() => handleSend("show best deals")}
              className={styles.primaryCta}
            >
              Explore Deals
              <Sparkles size={16} />
            </button>
            <a
              href={STORE_POLICIES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.secondaryCta}
            >
              View Policies
              <ExternalLink size={16} />
            </a>
          </div>
        </section>

        <section className={styles.storefrontRail}>
          {STOREFRONT_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.storefrontLink}
            >
              {item.label}
            </a>
          ))}
        </section>

        <section className={styles.chatShell}>
          <div className={styles.chatHeader}>
            <div className={styles.chatIdentity}>
              <div className={styles.botBadge}>
                <Bot size={22} />
              </div>
              <div>
                <h2>Snakitos Concierge</h2>
                <p>Live snack help</p>
              </div>
            </div>
            <a
              href={STORE_PRODUCTS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.headerLink}
            >
              Shop All
            </a>
          </div>

          <div className={styles.quickRail}>
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() =>
                  handleSend({
                    value: action.value,
                    displayText: action.label,
                    silent: true,
                  })
                }
                className={styles.quickRailChip}
              >
                {action.label}
              </button>
            ))}
          </div>

          <div ref={scrollRef} className={styles.chatBody}>
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === "user" ? styles.messageRowUser : styles.messageRowAssistant
                }
              >
                <div
                  className={
                    message.role === "user" ? styles.avatarUser : styles.avatarAssistant
                  }
                >
                  {message.role === "user" ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div
                  className={
                    message.role === "user" ? styles.userBubble : styles.assistantBubble
                  }
                >
                  {message.role === "assistant"
                    ? renderAssistantMessage(message.content)
                    : message.content}
                </div>
              </div>
            ))}

            {loading ? (
              <div className={styles.messageRowAssistant}>
                <div className={styles.avatarAssistant}>
                  <Loader2 size={14} className={styles.spinner} />
                </div>
                <div className={styles.loadingBubble}>Checking Snakitos...</div>
              </div>
            ) : null}
          </div>

          <div className={styles.chatFooter}>
            <div className={styles.inputWrap}>
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSend()}
                placeholder="Ask about collections, bundles, policies, or your order..."
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
            <p className={styles.footerNote}>Fast answers with official Snakitos links</p>
          </div>
        </section>

        <section className={styles.collectionPanel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Collections</span>
              <h2>Shop by Snakitos category</h2>
            </div>
            <a
              href={STORE_PRODUCTS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.panelLink}
            >
              View all
            </a>
          </div>

          <div className={styles.collectionScroller}>
            {COLLECTION_ACTIONS.map((category) => (
              <div key={category.label} className={styles.collectionCard}>
                <button
                onClick={() =>
                  handleSend({
                    value: category.value,
                    displayText: category.label,
                    silent: true,
                  })
                }
                  className={styles.collectionButton}
                >
                  <strong>{category.label}</strong>
                  <span>{category.blurb}</span>
                </button>
                <a
                  href={category.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.collectionLink}
                >
                  Open collection
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.utilityGrid}>
          <button
            onClick={() =>
              handleSend({
                value: "show gift packs",
                displayText: "Bundles & Gifts",
                silent: true,
              })
            }
            className={styles.utilityCard}
          >
            <div className={styles.utilityIcon}>
              <Gift size={18} />
            </div>
            <strong>Bundles & Gifts</strong>
            <span>Push bundle and gifting queries to the right collections quickly.</span>
          </button>

          <button
            onClick={() =>
              handleSend({
                value: "track my order",
                displayText: "Order Help",
                silent: true,
              })
            }
            className={styles.utilityCard}
          >
            <div className={styles.utilityIcon}>
              <Package size={18} />
            </div>
            <strong>Order Help</strong>
            <span>Route tracking and support questions into the order flow.</span>
          </button>

          <button
            onClick={() =>
              handleSend({
                value: "show shipping and refund policy",
                displayText: "Policy Help",
                silent: true,
              })
            }
            className={styles.utilityCard}
          >
            <div className={styles.utilityIcon}>
              <ScrollText size={18} />
            </div>
            <strong>Policy Help</strong>
            <span>Use the Snakitos policy pages as the source of truth.</span>
          </button>
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
