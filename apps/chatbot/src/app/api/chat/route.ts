import { NextResponse } from "next/server";
import { supportAgentService } from "../../../../../../services/support-agent.service";
import { ChatRequestBody } from "../../../../../../types/chat.types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const result = await supportAgentService.handleChat({
      message,
      userId: body.userId,
      chatId: body.chatId,
      email: body.email,
      phone: body.phone,
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
