import { NextResponse } from "next/server";
import { saveInteraction } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { message, userId } = await request.json();

    // 1. Logic for AI Response (Placeholder for now)
    // You would normally call OpenAI here
    const aiResponse = `I received your message: "${message}". How can I help you with your Shopify order?`;

    // 2. Save the interaction to Supabase for the Admin to see
    await saveInteraction(userId || "anonymous", message, aiResponse);

    return NextResponse.json({ response: aiResponse });
  } catch (error) {
    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
