import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { assertServiceClient } from "@/lib/db";
import { withAdminPath } from "@/lib/constants";
import { ProfilePage } from "@/components/control-center/ProfilePage";

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "SA"
  );
}

function roleLabel(role?: string | null) {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "support_agent":
      return "Support Agent";
    case "content_manager":
      return "Content Manager";
    default:
      return "Viewer";
  }
}

export default async function Page() {
  const session = await requireAdminSession();
  if (!session) {
    redirect(withAdminPath("/login"));
  }

  const supabase = assertServiceClient();
  const { data } = await supabase
    .from("admins")
    .select("id, email, full_name, is_active, last_login_at, created_at, password_changed_at, admin_roles!inner(key)")
    .eq("id", session.id)
    .single();

  if (!data) {
    redirect(withAdminPath("/login"));
  }

  const roles = Array.isArray(data.admin_roles) ? data.admin_roles : [data.admin_roles];
  const role = roles[0]?.key;
  const name = data.full_name ?? data.email ?? "Snakitos Admin";

  return (
    <ProfilePage
      user={{
        id: data.id,
        name,
        email: data.email,
        role: roleLabel(role),
        status: data.is_active ? "Active" : "Disabled",
        avatar: initials(name),
        lastLogin: formatDate(data.last_login_at),
        createdAt: formatDate(data.created_at),
        passwordChangedAt: formatDate(data.password_changed_at),
      }}
    />
  );
}
