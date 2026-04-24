import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const adminBasePath = "/apps/admin";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const adminKey = process.env.ADMIN_SECRET_KEY;

    if (!adminKey) {
      console.error("ADMIN_SECRET_KEY is not defined in environment variables.");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    if (password === adminKey) {
      const cookieStore = await cookies();
      
      // Set a secure session cookie
      cookieStore.set("admin_session", "authenticated", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24, // 24 hours
        path: adminBasePath,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
