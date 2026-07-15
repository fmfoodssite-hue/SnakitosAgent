import { NextResponse } from "next/server";
import { refreshAdminSession } from "@/lib/auth";

export async function POST() {
  try {
    const session = await refreshAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin session refresh failed", error);
    return NextResponse.json({ error: "Unable to refresh session" }, { status: 400 });
  }
}
