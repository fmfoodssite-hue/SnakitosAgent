import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export async function PUT(request: Request) {
  const payload = await request.json();
  const supabase = getSupabaseServiceClient();

  if (!supabase) {
    return NextResponse.json({ ok: true, preview: true });
  }

  await supabase.from("bot_settings").upsert({
    id: crypto.randomUUID(),
    bot_name: payload.botName,
    welcome_message: payload.welcomeMessage,
    fallback_message: payload.fallbackMessage,
    tone: payload.tone,
    enable_order_tracking: payload.enableOrderTracking,
    enable_product_recommendations: payload.enableProductRecommendations,
    support_email: payload.supportEmail,
    support_whatsapp: payload.supportWhatsapp,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
