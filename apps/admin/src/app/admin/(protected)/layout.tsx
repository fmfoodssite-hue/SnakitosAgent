import { AdminShell } from "@/components/dashboard/admin-shell";
import { getDashboardSnapshot } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();
  const snapshot = await getDashboardSnapshot();

  return <AdminShell admin={admin.profile} storeName={snapshot.storeName}>{children}</AdminShell>;
}
