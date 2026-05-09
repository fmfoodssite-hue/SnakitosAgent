import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const adminBasePath = "/admin";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete({
    name: "admin_session",
    path: adminBasePath,
  });
  return NextResponse.json({ success: true });
}
