"use client";

import React, { useState, useEffect } from "react";
import { User, Clock, Search, Bot, Database, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const adminBasePath = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH || "/apps/admin";

type InteractionContext = {
  id: string;
  name: string;
  source: string;
  type: string;
  category?: string;
  link?: string;
};

type InteractionMessage = {
  id: string;
  sessionId: string;
  userId: string;
  query: string;
  response: string;
  intent: string;
  status: string;
  sourceLabel: string;
  detailsSummary: string;
  responseTimeMs: number;
  createdAt: string;
  retrievedContext: InteractionContext[];
};

type InteractionSession = {
  sessionId: string;
  userId: string;
  latestQuery: string;
  latestTimestamp: string;
  messageCount: number;
  messages: InteractionMessage[];
};

export default function InteractionsPage() {
  const [sessions, setSessions] = useState<InteractionSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await fetch(`${adminBasePath}/api/admin/interactions`, { cache: "no-store" });
      const payload = (await response.json()) as { sessions?: InteractionSession[] };
      const nextSessions = payload.sessions ?? [];
      setSessions(nextSessions);
      if (nextSessions.length > 0) {
        setSelectedSession(nextSessions[0]?.sessionId ?? null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredSessions = sessions.filter((session) => {
    const haystack = `${session.userId} ${session.latestQuery}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const activeSession =
    filteredSessions.find((session) => session.sessionId === selectedSession) ??
    filteredSessions[0] ??
    null;

  return (
    <div className="flex min-h-[calc(100vh-120px)] flex-col">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Interactions</h1>
          <p className="text-zinc-400 mt-1">Review all AI chat sessions from your Shopify store.</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-hidden xl:flex-row xl:gap-8">
        {/* Session List */}
        <div className="glass-card flex h-[320px] flex-col overflow-hidden rounded-3xl border-white/5 xl:h-auto xl:w-80 xl:flex-none">
          <div className="p-4 border-b border-white/5 bg-white/[0.02]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input 
                type="text" 
                placeholder="Search users..." 
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <div className="p-8 text-center text-zinc-500 animate-pulse">Loading sessions...</div>
            ) : filteredSessions.map((session) => (
              <button
                key={session.sessionId}
                onClick={() => setSelectedSession(session.sessionId)}
                className={cn(
                  "w-full text-left p-4 rounded-2xl transition-all group",
                  activeSession?.sessionId === session.sessionId 
                    ? "bg-indigo-600 shadow-lg shadow-indigo-500/20 text-white" 
                    : "hover:bg-white/5 text-zinc-400 hover:text-white"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <User className="w-3 h-3" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      User_{session.userId.slice(0, 4)}
                    </span>
                  </div>
                  <span className="text-[10px] opacity-60">
                    {new Date(session.latestTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm line-clamp-1 opacity-80">{session.latestQuery}</p>
                <p className="mt-2 text-[10px] uppercase tracking-wider opacity-60">
                  {session.messageCount} message{session.messageCount === 1 ? "" : "s"}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Message Log */}
        <div className="glass-card flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-3xl border-white/5">
          <div className="flex flex-col gap-4 border-b border-white/5 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
                <User className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate font-bold">
                  Session ID: {activeSession?.sessionId || "No session selected"}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">
                    {activeSession ? `User ${activeSession.userId}` : "Active Interaction"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-8 overflow-y-auto bg-black/20 p-4 sm:p-6 lg:p-8">
            {activeSession?.messages.map((msg, i) => (
              <div key={i} className="space-y-4">
                {/* User Message */}
                <div className="flex max-w-full items-start gap-3 sm:max-w-[88%] sm:gap-4">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-zinc-400" />
                  </div>
                  <div className="min-w-0 rounded-2xl rounded-tl-none border border-white/5 bg-zinc-800/50 p-4">
                    <p className="text-sm text-zinc-300">{msg.query}</p>
                    <div className="mt-2 flex items-center gap-2 opacity-30">
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px]">{new Date(msg.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* AI Response */}
                <div className="ml-auto flex max-w-full flex-row-reverse items-start gap-3 sm:max-w-[88%] sm:gap-4">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0 space-y-3 rounded-2xl rounded-tr-none border border-indigo-500/20 bg-indigo-600/10 p-4">
                    <p className="text-sm text-indigo-100">{msg.response}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-indigo-200/70">
                      <span className="rounded-full border border-indigo-400/20 px-2 py-1">
                        {msg.intent}
                      </span>
                      <span className="rounded-full border border-indigo-400/20 px-2 py-1">
                        {msg.sourceLabel}
                      </span>
                      {msg.responseTimeMs > 0 ? (
                        <span className="rounded-full border border-indigo-400/20 px-2 py-1">
                          {msg.responseTimeMs} ms
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-indigo-100/70">{msg.detailsSummary}</p>
                    {msg.retrievedContext.length > 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-200">
                          <Database className="h-3.5 w-3.5" />
                          Retrieved context
                        </div>
                        <div className="space-y-2">
                          {msg.retrievedContext.map((item) => (
                            <div key={`${msg.id}-${item.id}`} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-white">{item.name}</p>
                                  <p className="mt-1 text-[11px] text-zinc-400">
                                    {item.source} | {item.type}
                                    {item.category ? ` | ${item.category}` : ""}
                                  </p>
                                </div>
                                <Sparkles className="h-4 w-4 flex-shrink-0 text-indigo-300/70" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2 opacity-30">
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px]">{new Date(msg.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )) || (
              <div className="py-16 text-center text-zinc-500">No interaction session selected.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
