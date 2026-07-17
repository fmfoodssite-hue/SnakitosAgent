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

  if (pathname === "/login" || pathname.endsWith("/login")) {
    return <>{children}</>;
  }

  return (
    <div className="h-dvh overflow-hidden bg-white text-[#2D3138] dark:bg-[radial-gradient(circle_at_top_left,rgba(227,190,47,0.18),transparent_28%),linear-gradient(180deg,#2D3138_0%,#373635_100%)] dark:text-[#FFF7DF]">
      <div className="flex h-full min-h-0">
        <AppSidebar />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TopNavbar />
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
            <div className="mx-auto max-w-[1480px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
