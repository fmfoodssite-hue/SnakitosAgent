"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import { withAdminPath } from "@/lib/constants";
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
          "fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-sm md:hidden",
          mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[290px] flex-col border-r border-slate-200 bg-white transition-transform duration-300 md:static md:translate-x-0",
          sidebarCollapsed ? "md:w-[88px]" : "md:w-[290px]",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5">
          <div className={cn("flex items-center gap-3", sidebarCollapsed && "md:justify-center")}>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            {!sidebarCollapsed ? (
              <div>
                <div className="text-base font-semibold text-slate-950">Snakitos AI</div>
                <div className="text-xs text-slate-500">RAG Control Center</div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            className="hidden rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 md:inline-flex"
            aria-label="Toggle sidebar"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
          {navSections.map((section) => (
            <div key={section.title}>
              {!sidebarCollapsed ? (
                <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
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
                        isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
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

        <div className="border-t border-slate-200 p-4">
          <Button
            variant="outline"
            className={cn("w-full justify-start", sidebarCollapsed && "md:justify-center")}
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
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
