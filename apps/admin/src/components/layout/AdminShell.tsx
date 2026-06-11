"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAdminShell } from "@/hooks/use-admin-shell";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopNavbar } from "@/components/layout/TopNavbar";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { hydrateUser } = useAdminShell();

  useEffect(() => {
    hydrateUser();
  }, [hydrateUser]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] text-slate-900">
      <div className="flex min-h-screen">
        <AppSidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <TopNavbar />
          <main className="flex-1 px-4 py-6 md:px-6">
            <div className="mx-auto max-w-[1480px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
