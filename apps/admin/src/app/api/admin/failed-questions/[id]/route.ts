import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { action } = (await request.json()) as { action?: "faq" | "improve" | "resolve" };
  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  if (!supabase) {
    return NextResponse.json({ ok: true, preview: true });
  }

  if (action === "resolve") {
    await supabase.from("failed_questions").update({ resolved: true }).eq("id", id);
  } else if (action === "faq") {
    const { data } = await supabase
      .from("failed_questions")
      .select("question, suggested_answer")
      .eq("id", id)
      .maybeSingle();
    if (data) {
      await supabase.from("faq_entries").insert({
        id: crypto.randomUUID(),
        question: data.question,
        answer: data.suggested_answer ?? "",
        source: "admin",
      });
    }
  } else if (action === "improve") {
    await supabase.from("analytics_events").insert({
      id: crypto.randomUUID(),
      event_name: "training_improvement_requested",
      label: id,
      created_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true });
}
