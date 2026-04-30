"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Bot,
  CornerDownLeft,
  ExternalLink,
  Gift,
  House,
  Loader2,
  Map,
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

const STORE_HOME_URL = "https://snakitos.com/";
const STORE_PRODUCTS_URL = "https://snakitos.com/collections/all";

const CATEGORY_ACTIONS: Array<{ label: string; value: string; blurb: string }> = [
  {
    label: "Sweet Tooth",
    value: "Show me Sweet Tooth snacks",
    blurb: "Wafer rolls, choco sticks, and chocolate-forward favorites.",
  },
  {
    label: "Multi Grain",
    value: "Show me Multi Grain snacks",
    blurb: "Stix, chickpea picks, and bolder crunchy flavors.",
  },
  {
    label: "Potato Slims",
    value: "Show me Potato Slims",
    blurb: "Classic salty and masala snack cravings.",
  },
  {
    label: "Banana Chips",
    value: "Show me Banana Chips",
    blurb: "Sea salt, BBQ, cheese, and achari masti choices.",
  },
];

const QUICK_ACTIONS: Option[] = [
  { label: "Deals", value: "show best deals" },
  { label: "Gift Packs", value: "show gift packs" },
  { label: "Track Order", value: "track my order" },
  { label: "Policies", value: "show shipping and refund policy" },
];

export default function PublicChatbot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: JSON.stringify({
        type: "mixed",
        message:
          "Welcome to Snakitos. I can help you explore snacks, bundles, policies, or order support.",
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

  const handleSend = async (overrideMessage?: string) => {
    const messageToSend = overrideMessage || input.trim();
    if (!messageToSend || loading) {
      return;
    }

    if (messageToSend.toLowerCase() === "home") {
      window.open(STORE_HOME_URL, "_blank", "noopener,noreferrer");
      return;
    }

    const detectedPhone = extractPhoneNumber(messageToSend) || phone;
    if (detectedPhone) {
      setPhone(detectedPhone);
      localStorage.setItem("chat_phone", detectedPhone);
    }

    if (!overrideMessage) {
      setInput("");
    }

    setMessages((prev) => [...prev, { role: "user", content: messageToSend }]);
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
          onClick={() => handleSend(option.value)}
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
            <p className={styles.assistantText}>{parsed.message}</p>

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
          <p className={styles.assistantText}>{content}</p>
          {renderOptions([])}
        </div>
      );
    }

    return (
      <div className={styles.assistantContent}>
        <p className={styles.assistantText}>{content}</p>
        {renderOptions([])}
      </div>
    );
  };

  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlow} />

      <div className={styles.layout}>
        <section className={styles.brandPanel}>
          <div className={styles.brandHeader}>
            <div className={styles.badges}>
              <span>Export Quality</span>
              <span>Pakistani Snacks</span>
            </div>
            <h1>Snakitos support that feels like part of the storefront.</h1>
            <p>
              Browse sweet bites, spicy stix, potato slims, banana chips, bundles,
              gifting ideas, and policy help in one place.
            </p>

            <div className={styles.heroActions}>
              <a
                href={STORE_HOME_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.primaryCta}
              >
                Visit Snakitos
                <ExternalLink size={16} />
              </a>
              <button
                onClick={() => handleSend("show best deals")}
                className={styles.secondaryCta}
              >
                Explore Deals
                <Sparkles size={16} />
              </button>
            </div>
          </div>

          <div className={styles.featureGrid}>
            <div className={styles.categoryPanel}>
              <div className={styles.sectionLabel}>
                <Map size={14} />
                <span>Shop by Category</span>
              </div>
              <div className={styles.categoryGrid}>
                {CATEGORY_ACTIONS.map((category) => (
                  <button
                    key={category.label}
                    onClick={() => handleSend(category.value)}
                    className={styles.categoryCard}
                  >
                    <strong>{category.label}</strong>
                    <span>{category.blurb}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.insightGrid}>
              <button
                onClick={() => handleSend("show gift packs")}
                className={styles.infoCard}
              >
                <div className={styles.infoIcon}>
                  <Gift size={18} />
                </div>
                <strong>Gift Packs</strong>
                <span>Push visitors toward variety packs and gifting-friendly bundles.</span>
              </button>

              <button
                onClick={() => handleSend("show popular snacks")}
                className={styles.infoCard}
              >
                <div className={styles.infoIcon}>
                  <ShoppingBag size={18} />
                </div>
                <strong>Popular Picks</strong>
                <span>Fast route to spicy, crunchy, sweet, and savory recommendations.</span>
              </button>

              <div className={styles.infoCardStatic}>
                <div className={styles.infoIcon}>
                  <Sparkles size={18} />
                </div>
                <strong>Store Tone</strong>
                <span>
                  Warm, direct, giftable, and category-led, like the live Snakitos site.
                </span>
              </div>
            </div>
          </div>
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
                onClick={() => handleSend(action.value)}
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
                <div className={styles.loadingBubble}>Snakitos AI is thinking...</div>
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
                placeholder="Ask about stix, bundles, policies, or your order..."
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
            <p className={styles.footerNote}>Grounded answers with direct Snakitos links</p>
          </div>
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
