import { NextResponse } from "next/server";
import { runAdminChatTest } from "@/lib/test-chat";

export async function POST(request: Request) {
  const { message } = (await request.json()) as { message?: string };
  const result = await runAdminChatTest(message ?? "");
  return NextResponse.json(result);
}
