"use client";

import React, { useState, useEffect } from "react";
import { MessageSquare, User, Clock, Search, Bot } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export default function InteractionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages(selectedUser);
    }
  }, [selectedUser]);

  const fetchSessions = async () => {
    try {
      // Get unique user IDs and their latest message
      const { data, error } = await supabase
        .from("interactions")
        .select("user_id, created_at, query")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter for unique users (latest interaction first)
      const uniqueIds = Array.from(new Set(data.map(i => i.user_id)));
      const uniqueUsers = uniqueIds
        .map(id => data.find(i => i.user_id === id))
        .filter((user): user is NonNullable<typeof user> => !!user);

      setSessions(uniqueUsers);
      if (uniqueUsers.length > 0 && uniqueUsers[0]) {
        setSelectedUser(uniqueUsers[0].user_id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("interactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Interactions</h1>
          <p className="text-zinc-400 mt-1">Review all AI chat sessions from your Shopify store.</p>
        </div>
      </div>

      <div className="flex-1 flex gap-8 overflow-hidden">
        {/* Session List */}
        <div className="w-80 glass-card rounded-3xl overflow-hidden flex flex-col border-white/5">
          <div className="p-4 border-b border-white/5 bg-white/[0.02]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input 
                type="text" 
                placeholder="Search users..." 
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <div className="p-8 text-center text-zinc-500 animate-pulse">Loading sessions...</div>
            ) : sessions.map((session) => (
              <button
                key={session.user_id}
                onClick={() => setSelectedUser(session.user_id)}
                className={cn(
                  "w-full text-left p-4 rounded-2xl transition-all group",
                  selectedUser === session.user_id 
                    ? "bg-indigo-600 shadow-lg shadow-indigo-500/20 text-white" 
                    : "hover:bg-white/5 text-zinc-400 hover:text-white"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <User className="w-3 h-3" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      User_{session.user_id.slice(0, 4)}
                    </span>
                  </div>
                  <span className="text-[10px] opacity-60">
                    {new Date(session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm line-clamp-1 opacity-80">{session.query}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Message Log */}
        <div className="flex-1 glass-card rounded-3xl overflow-hidden flex flex-col border-white/5">
          <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold">Session ID: {selectedUser}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Active Interaction</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-black/20">
            {messages.map((msg, i) => (
              <div key={i} className="space-y-4">
                {/* User Message */}
                <div className="flex items-start gap-4 max-w-[85%]">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-zinc-400" />
                  </div>
                  <div className="bg-zinc-800/50 p-4 rounded-2xl rounded-tl-none border border-white/5">
                    <p className="text-sm text-zinc-300">{msg.query}</p>
                    <div className="mt-2 flex items-center gap-2 opacity-30">
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px]">{new Date(msg.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* AI Response */}
                <div className="flex items-start gap-4 max-w-[85%] ml-auto flex-row-reverse">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-indigo-600/10 p-4 rounded-2xl rounded-tr-none border border-indigo-500/20">
                    <p className="text-sm text-indigo-100">{msg.response}</p>
                    <div className="mt-2 flex items-center gap-2 opacity-30">
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px]">{new Date(msg.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
