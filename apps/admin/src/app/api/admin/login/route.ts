import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getAdminProfile } from "@/lib/admin/data";
import { env, hasSupabaseEnv } from "@/lib/env";

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as { email?: string; password?: string };

  if (!hasSupabaseEnv()) {
    const cookieStore = await cookies();
    cookieStore.set("local_admin_session", "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return NextResponse.json({ ok: true });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items) {
        items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email ?? "",
    password: password ?? "",
  });

  if (error || !data.user?.id || !data.user.email) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const { data: adminRow } = await supabase
    .from("admins")
    .select("id")
    .eq("id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();

  const profile = adminRow ? { id: data.user.id, email: data.user.email } : await getAdminProfile(data.user.id, data.user.email);
  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "You do not have admin access." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
