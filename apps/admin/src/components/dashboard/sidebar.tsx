"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  ChartColumnBig,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/chats", label: "Chats", icon: MessageSquareText },
  { href: "/admin/failed-questions", label: "Failed Questions", icon: AlertTriangle },
  { href: "/admin/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/admin/shopify", label: "Shopify", icon: ShoppingBag },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/test-chat", label: "Test Chat", icon: Bot },
  { href: "/admin/analytics", label: "Analytics", icon: ChartColumnBig },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-slate-950/70 px-4 py-6 lg:block">
      <div className="mb-10 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs uppercase tracking-[0.28em] text-sky-300">Admin Control</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">RAG Commerce OS</h1>
        <p className="mt-2 text-sm text-slate-400">
          Monitor answers, train knowledge, and optimize Shopify-assisted conversion.
        </p>
      </div>

      <nav className="space-y-1">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition",
                active ? "bg-sky-400/12 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <item.icon className={cn("h-5 w-5", active ? "text-sky-300" : "text-slate-500")} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
