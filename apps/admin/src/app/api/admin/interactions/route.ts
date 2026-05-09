import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminInteractions } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session")?.value;

  if (session !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await getAdminInteractions();
  return NextResponse.json({ sessions });
}
