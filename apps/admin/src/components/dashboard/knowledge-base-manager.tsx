"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KnowledgeDocumentRecord } from "@/lib/admin/types";

export function KnowledgeBaseManager({ documents }: { documents: KnowledgeDocumentRecord[] }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const createFaq = async () => {
    setLoading(true);
    const response = await fetch("/api/admin/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, sourceType: "faq" }),
    });
    setLoading(false);

    if (!response.ok) {
      toast.error("Could not save knowledge");
      return;
    }

    setTitle("");
    setContent("");
    toast.success("Knowledge entry saved");
  };

  const syncProducts = async () => {
    const response = await fetch("/api/admin/shopify/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "products" }),
    });
    toast[response.ok ? "success" : "error"]("Product sync requested");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>Knowledge inventory</CardTitle>
          <CardDescription>Manage Shopify syncs, PDFs, FAQs, and Pinecone indexing status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Button onClick={syncProducts}>Sync Shopify products</Button>
            <Button variant="secondary">Upload PDF</Button>
            <Button variant="outline">Re-index Pinecone</Button>
          </div>
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-white">{doc.title}</p>
                    <p className="mt-1 text-sm text-slate-400">{doc.summary}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {doc.sourceType} • {doc.chunkCount} chunks
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm capitalize text-sky-200">{doc.status}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(doc.updatedAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add manual FAQ</CardTitle>
          <CardDescription>Close knowledge gaps fast by writing short, high-signal answer entries.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-slate-300">Question title</label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Refund policy for damaged items" />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-slate-300">Answer content</label>
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Explain the answer clearly so the retriever can ground future responses."
            />
          </div>
          <Button className="w-full" disabled={loading} onClick={createFaq}>
            Save FAQ entry
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
