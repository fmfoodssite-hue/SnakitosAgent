import { VercelRequest, VercelResponse } from "@vercel/node";
import { supportAgentService } from "../services/support-agent.service";
import { ChatRequestBody } from "../types/chat.types";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (req.body ?? {}) as ChatRequestBody;
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    res.status(400).json({ error: "Message is required." });
    return;
  }

  try {
    const result = await supportAgentService.handleChat({
      message,
      userId: body.userId,
      chatId: body.chatId,
      email: body.email,
      phone: body.phone,
    });

    res.status(200).json(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to process chat.";

    res.status(500).json({
      error: errorMessage,
      response:
        "We are having trouble processing your request right now. Please contact support on WhatsApp: +92-345-828-3827",
    });
  }
}
