import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminProfile } from "@/lib/admin/data";
import { AdminProfile } from "@/lib/admin/types";

async function getAdminProfileFromSession(userId: string, email: string): Promise<AdminProfile | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return {
      id: userId,
      email,
      fullName: "Local Admin",
      role: "admin",
    };
  }

  const { data } = await supabase
    .from("admins")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (data) {
    return {
      id: String(data.id),
      email: String(data.email ?? email),
      fullName: String(data.full_name ?? "Admin User"),
      role: "admin",
    };
  }

  return getAdminProfile(userId, email);
}

export async function getCurrentAdmin() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return {
      user: { id: "local-admin", email: "admin@example.com" },
      profile: { id: "local-admin", email: "admin@example.com", fullName: "Local Admin", role: "admin" as const },
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id || !user.email) {
    return null;
  }

  const profile = await getAdminProfileFromSession(user.id, user.email);
  if (!profile) {
    return null;
  }

  return { user, profile };
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return admin;
}
