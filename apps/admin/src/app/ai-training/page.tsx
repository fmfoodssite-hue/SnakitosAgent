"use client";

import React, { useState, useEffect } from "react";
import { Bot, Plus, Trash2, Save, FileText, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export default function AiTrainingPage() {
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchKnowledge();
  }, []);

  const fetchKnowledge = async () => {
    try {
      const { data, error } = await supabase
        .from("knowledge")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setKnowledge(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("knowledge")
        .insert([{ title, content }]);

      if (error) throw error;
      
      setTitle("");
      setContent("");
      fetchKnowledge();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const { error } = await supabase
        .from("knowledge")
        .delete()
        .eq("id", id);

      if (error) throw error;
      fetchKnowledge();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Training Center</h1>
          <p className="text-zinc-400 mt-1">Teach your agent about your products, policies, and store.</p>
        </div>
        <div className="flex items-center gap-2 bg-indigo-500/10 text-indigo-400 px-4 py-2 rounded-xl border border-indigo-500/20">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-bold uppercase tracking-wider">Brain Mode Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Section */}
        <div className="glass-card p-8 rounded-3xl border-white/5 h-fit sticky top-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Plus className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-semibold">Add New Knowledge</h2>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Title / Topic</label>
              <input 
                type="text" 
                placeholder="e.g. Return Policy, Product X Sizing..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Knowledge Content</label>
              <textarea 
                placeholder="Describe the details here. The more specific, the better the AI will answer."
                rows={8}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>

            <button 
              type="submit"
              disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {saving ? "Processing..." : "Save to Knowledge Base"}
            </button>
          </form>
        </div>

        {/* List Section */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold flex items-center gap-3 ml-2">
            <FileText className="w-5 h-5 text-zinc-500" />
            Existing Knowledge ({knowledge.length})
          </h2>

          <div className="space-y-4">
            {loading ? (
              <div className="py-12 text-center text-zinc-500 animate-pulse">Loading brain data...</div>
            ) : knowledge.length > 0 ? knowledge.map((item) => (
              <div key={item.id} className="glass-card p-6 rounded-2xl border-white/5 group hover:border-white/10 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                        Document
                      </span>
                      <h3 className="font-bold text-zinc-200">{item.title}</h3>
                    </div>
                    <p className="text-sm text-zinc-400 line-clamp-3 leading-relaxed">
                      {item.content}
                    </p>
                    <div className="mt-4 flex items-center gap-4 text-[10px] text-zinc-600 uppercase font-bold tracking-widest">
                      <span>Added: {new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(item.id)}
                    className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )) : (
              <div className="glass-card p-12 rounded-3xl border-dashed border-white/5 flex flex-col items-center text-center">
                <Bot className="w-12 h-12 text-zinc-700 mb-4" />
                <p className="text-zinc-500 max-w-[200px]">Your agent has no custom knowledge yet. Add something to get started!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
