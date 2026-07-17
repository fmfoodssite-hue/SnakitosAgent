"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { withAdminApiPath, withAdminPath } from "@/lib/constants";
import { navSections } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useAdminShell } from "@/hooks/use-admin-shell";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen, toggleSidebar, logout } = useAdminShell();

  if (pathname === "/login") return null;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-[#2D3138]/40 backdrop-blur-sm md:hidden",
          mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-[290px] flex-col overflow-hidden border-r border-[#E6DFC9] bg-white transition-transform duration-300 dark:border-[#E3BE2F]/25 dark:bg-[#373635] md:static md:translate-x-0",
          sidebarCollapsed ? "md:w-[88px]" : "md:w-[290px]",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="h-[104px] shrink-0 border-b border-[#EACD7D]/70 px-5 dark:border-[#E3BE2F]/25">
          <div className="flex h-full items-center justify-between">
            <div className={cn("flex min-w-0 items-center", sidebarCollapsed && "md:flex-1 md:justify-center")}>
              <Image
                src="/Snakitos_Logo_black.png"
                alt="Snakitos"
                width={174}
                height={58}
                priority
                className={cn("h-auto object-contain dark:hidden", sidebarCollapsed ? "w-12 md:w-12" : "w-40")}
              />
              <Image
                src="/Snakitos_Logo_white.webp"
                alt="Snakitos"
                width={174}
                height={58}
                priority
                className={cn("hidden h-auto object-contain dark:block", sidebarCollapsed ? "w-12 md:w-12" : "w-40")}
              />
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden rounded-2xl border border-[#EACD7D] p-2 text-[#6F6658] transition hover:bg-[#F1C36D]/20 dark:text-[#EACD7D] md:inline-flex"
              aria-label="Toggle sidebar"
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5">
          {navSections.map((section) => (
            <div key={section.title}>
              {!sidebarCollapsed ? (
                <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C4862D] dark:text-[#EACD7D]">
                  {section.title}
                </div>
              ) : null}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileSidebarOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition",
                        isActive
                          ? "bg-[#E3BE2F] text-[#2D3138] shadow-sm shadow-[#C4862D]/20"
                          : "text-[#5F5A51] hover:bg-[#F1C36D]/20 hover:text-[#2D3138] dark:text-[#FFF7DF]/75 dark:hover:bg-[#E3BE2F]/15 dark:hover:text-[#FFF7DF]",
                        sidebarCollapsed && "justify-center md:px-0",
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {!sidebarCollapsed ? <span>{item.label}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-[#EACD7D]/70 bg-white p-4 dark:border-[#E3BE2F]/25 dark:bg-[#373635]">
          <Button
            variant="outline"
            className={cn("w-full justify-start", sidebarCollapsed && "md:justify-center")}
            onClick={async () => {
              await fetch(withAdminApiPath("/api/auth/logout"), { method: "POST" }).catch(() => undefined);
              logout();
              router.push(withAdminPath("/login"));
            }}
          >
            <LogOut className={cn("h-4 w-4", !sidebarCollapsed && "mr-2")} />
            {!sidebarCollapsed ? "Logout" : null}
          </Button>
        </div>
      </aside>
    </>
  );
}
