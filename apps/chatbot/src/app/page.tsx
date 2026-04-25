"use client";

import React, { useState, useEffect, useRef } from "react";
import { Send, User, Bot, Loader2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function PublicChatbot() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! How can I help you today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [chatId, setChatId] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Generate or retrieve a persistent User ID
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
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: userMessage, userId, chatId }),
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (typeof data.chatId === "string" && data.chatId) {
        setChatId(data.chatId);
        localStorage.setItem("chat_id", data.chatId);
      }
      if (data.response) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
      }
    } catch (err) {
      console.error("Chat error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-[#09090b]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#4338ca_0%,transparent_50%)] opacity-20 pointer-events-none" />
      
      <div className="z-10 max-w-lg w-full bg-[#18181b] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[700px]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-sm">Snakitos Support</h2>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-[10px] text-indigo-100 uppercase font-bold tracking-wider">Online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-6 scroll-smooth">
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex items-end gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border",
                msg.role === "user" ? "bg-indigo-600 border-indigo-500" : "bg-white/5 border-white/10"
              )}>
                {msg.role === "user" ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-indigo-400" />}
              </div>
              <div className={cn(
                "max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed",
                msg.role === "user" 
                  ? "bg-indigo-600 text-white rounded-br-none" 
                  : "bg-white/5 text-zinc-300 border border-white/5 rounded-bl-none shadow-xl"
              )}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-end gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
              </div>
              <div className="bg-white/5 text-zinc-500 p-4 rounded-2xl rounded-bl-none text-xs italic">
                Agent is typing...
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-5 border-t border-white/5 bg-[#18181b]">
          <div className="relative group">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="How can I help you today?" 
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-5 pr-14 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
            />
            <button 
              onClick={handleSend}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}
