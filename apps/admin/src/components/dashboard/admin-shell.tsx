import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { AdminProfile } from "@/lib/admin/types";

export function AdminShell({
  children,
  admin,
  storeName,
}: {
  children: React.ReactNode;
  admin: AdminProfile;
  storeName: string;
}) {
  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top,#13203b,transparent_38%),linear-gradient(180deg,#020617,#0f172a_55%,#111827)] text-slate-100">
      <DashboardSidebar />
      <main className="min-h-screen flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <DashboardTopbar storeName={storeName} adminName={admin.fullName} />
          {children}
        </div>
      </main>
    </div>
  );
}
