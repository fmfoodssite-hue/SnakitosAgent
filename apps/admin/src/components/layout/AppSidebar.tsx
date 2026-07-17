"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
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
          "fixed inset-y-0 left-0 z-50 flex w-[290px] flex-col border-r border-[#E6DFC9] bg-white transition-transform duration-300 dark:border-[#E3BE2F]/25 dark:bg-[#373635] md:static md:translate-x-0",
          sidebarCollapsed ? "md:w-[88px]" : "md:w-[290px]",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-[#EACD7D]/70 px-5 py-5 dark:border-[#E3BE2F]/25">
          <div className={cn("flex items-center gap-3", sidebarCollapsed && "md:justify-center")}>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E3BE2F] to-[#C4862D] text-[#2D3138] shadow-sm shadow-[#C4862D]/25">
              <Sparkles className="h-5 w-5" />
            </div>
            {!sidebarCollapsed ? (
              <div>
                <div className="text-base font-semibold text-[#2D3138] dark:text-[#FFF7DF]">Snakitos AI</div>
                <div className="text-xs text-[#6F6658] dark:text-[#EACD7D]">RAG Control Center</div>
              </div>
            ) : null}
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

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
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

        <div className="border-t border-[#EACD7D]/70 p-4 dark:border-[#E3BE2F]/25">
          <Button
            variant="outline"
            className={cn("w-full justify-start", sidebarCollapsed && "md:justify-center")}
            onClick={async () => {
              await fetch(withAdminApiPath("/api/auth/logout"), { method: "POST" }).catch(() => undefined);
              logout();
              router.push(withAdminPath("/login"));
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {!sidebarCollapsed ? "Logout" : null}
          </Button>
        </div>
      </aside>
    </>
  );
}
