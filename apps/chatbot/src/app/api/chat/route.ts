import { NextResponse } from "next/server";
import { supportAgentService } from "@/server/services/support-agent.service";
import { ChatRequestBody } from "@/server/types/chat.types";

const MAX_MESSAGE_LENGTH = 600;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const message =
      typeof body.message === "string"
        ? body.message.replace(/[\u0000-\u001F\u007F]/g, " ").trim()
        : "";

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or less.` },
        { status: 413 },
      );
    }

    if (/[<>]/.test(message) || /<script|javascript:|data:text\/html/i.test(message)) {
      return NextResponse.json(
        { error: "Unsupported input format. Please send plain text only." },
        { status: 400 },
      );
    }

    const userId = typeof body.userId === "string" ? body.userId.trim() : undefined;
    const chatId = typeof body.chatId === "string" ? body.chatId.trim() : undefined;
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;

    const result = await supportAgentService.handleChat({
      message,
      userId,
      chatId,
      email,
      phone,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to process chat",
        response:
          "We are having trouble processing your request right now. Please contact support on WhatsApp: +92-345-828-3827",
      },
      { status: 500 },
    );
  }
}
