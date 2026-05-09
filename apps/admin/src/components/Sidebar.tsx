"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Users, 
  MessageSquare, 
  Settings, 
  Zap,
  BarChart3,
  Bot,
  LogOut,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";

const adminBasePath = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH || "/apps/admin";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: ShoppingBag, label: "Orders", href: "/orders" },
  { icon: Users, label: "Customers", href: "/customers" },
  { icon: Bot, label: "AI Training", href: "/ai-training" },
  { icon: MessageSquare, label: "Interactions", href: "/interactions" },
  { icon: BarChart3, label: "Analytics", href: "/analytics" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

type SidebarProps = {
  mobileOpen?: boolean;
  onClose?: () => void;
};

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Don't render sidebar on the login page
  if (pathname === "/login") return null;

  const handleLogout = async () => {
    await fetch(`${adminBasePath}/api/auth/logout`, { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-72 max-w-[85vw] flex-col border-r border-white/5 bg-[#09090b] transition-transform duration-300 md:sticky md:top-0 md:z-auto md:w-64 md:max-w-none md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between p-6 md:block">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 bg-gradient-premium rounded-lg flex items-center justify-center">
              <Zap className="text-white w-5 h-5 fill-current" />
            </div>
            <span className="font-bold text-xl tracking-tight">Agent Admin</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 p-2 text-zinc-400 transition hover:border-white/20 hover:text-white md:hidden"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-4 py-4">
          {menuItems.map((item) => {
            const href = item.href;
            const isActive = pathname === href;
            return (
              <Link
                key={item.href}
                href={href}
                onClick={onClose}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200",
                  isActive 
                    ? "bg-white/5 text-white" 
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon className={cn(
                  "h-5 w-5 transition-transform duration-200 group-hover:scale-110",
                  isActive ? "text-indigo-400" : "text-zinc-500"
                )} />
                <span className="font-medium">{item.label}</span>
                {isActive && (
                  <div className="ml-auto h-5 w-1 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2 p-4">
          <button
            onClick={handleLogout}
            className="group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-zinc-400 transition-all duration-200 hover:bg-red-500/5 hover:text-red-400"
          >
            <LogOut className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
            <span className="font-medium">Logout</span>
          </button>

          <div className="glass-card rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-indigo-400">Status</p>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-sm font-medium text-zinc-300">AI Agent Online</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
