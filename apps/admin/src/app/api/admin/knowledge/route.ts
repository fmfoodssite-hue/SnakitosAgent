import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const { title, content, sourceType } = (await request.json()) as {
    title?: string;
    content?: string;
    sourceType?: string;
  };
  const supabase = getSupabaseServiceClient();

  if (!title || !content) {
    return NextResponse.json({ error: "Title and content are required." }, { status: 400 });
  }

  if (!supabase) {
    return NextResponse.json({ ok: true, preview: true });
  }

  const id = crypto.randomUUID();
  await supabase.from("knowledge_documents").insert({
    id,
    title,
    content,
    source_type: sourceType ?? "manual",
    status: "queued",
    chunk_count: Math.max(1, Math.ceil(content.length / 500)),
    summary: content.slice(0, 140),
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, id });
}
