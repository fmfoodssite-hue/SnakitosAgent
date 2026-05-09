"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type TestResult = {
  context: Array<{ id: string; name: string; text: string; link: string; score?: number }>;
  answer: string;
  confidence: number;
};

export function TestChatPanel() {
  const [query, setQuery] = useState("What are your best snacks for movie night?");
  const [result, setResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runTest = async () => {
    setLoading(true);
    const response = await fetch("/api/admin/test-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: query }),
    });
    setLoading(false);

    if (!response.ok) {
      toast.error("Test request failed");
      return;
    }

    const payload = (await response.json()) as TestResult;
    setResult(payload);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <Card>
        <CardHeader>
          <CardTitle>Internal test chat</CardTitle>
          <CardDescription>Run the same RAG pipeline with transparent retrieval and confidence outputs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} />
          <Button disabled={loading} onClick={runTest}>
            Run test
          </Button>
          {result && (
            <div className="rounded-2xl border border-sky-400/20 bg-sky-400/8 p-4">
              <p className="text-sm text-slate-300">Confidence score</p>
              <p className="mt-1 text-3xl font-semibold text-white">{Math.round(result.confidence * 100)}%</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retrieved context + answer</CardTitle>
          <CardDescription>See exactly what the assistant saw before composing the final answer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <p className="mb-3 text-sm font-medium text-slate-300">Final answer</p>
            <p className="text-sm leading-7 text-slate-100">{result?.answer ?? "Run a test to inspect the live answer."}</p>
          </div>
          <div className="space-y-3">
            {(result?.context ?? []).map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{item.name}</p>
                  <span className="text-xs text-slate-500">{Math.round((item.score ?? 0.75) * 100)}% match</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{item.text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
