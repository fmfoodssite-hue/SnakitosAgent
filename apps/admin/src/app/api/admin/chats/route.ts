import { NextResponse } from "next/server";
import { getChatMessages } from "@/lib/admin/data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rows = await getChatMessages({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    intent: searchParams.get("intent") ?? undefined,
    status: searchParams.get("status") ?? undefined,
  });

  return NextResponse.json({ rows });
}
