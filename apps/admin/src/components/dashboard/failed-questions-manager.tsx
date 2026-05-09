"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FailedQuestionRecord } from "@/lib/admin/types";

export function FailedQuestionsManager({ items }: { items: FailedQuestionRecord[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleAction = async (id: string, action: "faq" | "improve" | "resolve") => {
    setLoadingId(id);
    const response = await fetch(`/api/admin/failed-questions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoadingId(null);

    if (!response.ok) {
      toast.error("Action failed");
      return;
    }

    toast.success("Question updated");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unanswered questions</CardTitle>
        <CardDescription>Turn misses into new FAQs, prompt refinements, and resolved answers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-white">{item.question}</h3>
                  <span className="rounded-full bg-rose-400/10 px-2 py-1 text-xs text-rose-200">
                    {item.frequency} misses
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-1 text-xs text-slate-300">{item.category}</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{item.suggestedAnswer}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Last seen {new Date(item.latestAttemptAt).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={loadingId === item.id}
                  onClick={() => handleAction(item.id, "faq")}
                >
                  Add to FAQ
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingId === item.id}
                  onClick={() => handleAction(item.id, "improve")}
                >
                  Improve answer
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  disabled={loadingId === item.id}
                  onClick={() => handleAction(item.id, "resolve")}
                >
                  Mark resolved
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
