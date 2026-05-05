import { NextResponse } from "next/server";
import { supportAgentService } from "@/server/services/support-agent.service";
import { ChatRequestBody } from "@/server/types/chat.types";
import { buildClientKey, consumeRequestRateLimit } from "@/server/utils/security.util";

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
    const ipHeader =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      request.headers.get("cf-connecting-ip") ??
      "";
    const ip = ipHeader.split(",")[0]?.trim() ?? "";
    const clientKey = buildClientKey({
      ip,
      userId,
      chatId,
      phone,
    });
    const rateLimit = consumeRequestRateLimit(clientKey);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many requests. Please wait a moment and try again.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const result = await supportAgentService.handleChat({
      message,
      userId,
      chatId,
      email,
      phone,
      clientKey,
    });

    return NextResponse.json(result);
  } catch {
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
