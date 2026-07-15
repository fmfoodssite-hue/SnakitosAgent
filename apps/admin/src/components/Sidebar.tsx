"use client";

import Link from "next/link";
import React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  FileStack,
  FlaskConical,
  FolderSync,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  ShieldCheck,
  ShoppingBag,
  Ticket,
  Settings,
  ScrollText,
  BarChart3,
  Upload,
  X,
  Menu,
} from "lucide-react";
import { withAdminApiPath, withAdminPath } from "@/lib/constants";
import { cn } from "@/lib/utils";

const items = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Knowledge Base", href: "/knowledge-base", icon: FileStack },
  { label: "Uploads", href: "/uploads", icon: Upload },
  { label: "Shopify Sync", href: "/shopify-sync", icon: ShoppingBag },
  { label: "Prompt Control", href: "/prompt-control", icon: Bot },
  { label: "Conversations", href: "/conversations", icon: MessageSquareText },
  { label: "Handoffs", href: "/handoffs", icon: Ticket },
  { label: "Testing Lab", href: "/testing-lab", icon: FlaskConical },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Guardrails", href: "/guardrails", icon: ShieldCheck },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Audit Logs", href: "/audit-logs", icon: ScrollText },
];

type SidebarProps = {
  mobileOpen?: boolean;
  onClose?: () => void;
  onOpen?: () => void;
};

export default function Sidebar({ mobileOpen = false, onClose, onOpen }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") {
    return null;
  }

  const handleLogout = async () => {
    await fetch(withAdminApiPath("/api/auth/logout"), { method: "POST" });
    router.push(withAdminPath("/login"));
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="fixed left-4 top-4 z-40 rounded-xl border border-white/10 bg-[#09090b]/80 p-2 text-zinc-200 backdrop-blur md:hidden"
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-80 max-w-[88vw] flex-col border-r border-white/5 bg-[#09090b] px-4 py-5 transition-transform duration-300 md:sticky md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-5 flex items-center justify-between px-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-300">Snakitos</p>
            <h2 className="mt-2 text-xl font-semibold text-white">RAG Admin</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 p-2 text-zinc-400 md:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 rounded-3xl border border-indigo-500/15 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_55%)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-200">
              <FolderSync className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Knowledge + Commerce</p>
              <p className="text-xs text-zinc-400">Support, prompts, ingestion, and sync</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
          {items.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition",
                  isActive ? "bg-white/8 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "text-indigo-300" : "text-zinc-500")} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm text-zinc-300 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-200"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </aside>
    </>
  );
}
