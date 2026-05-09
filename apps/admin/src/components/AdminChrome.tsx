"use client";

import React from "react";
import { Menu, Zap } from "lucide-react";
import Sidebar from "@/components/Sidebar";

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen w-full bg-[#09090b] text-zinc-100">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="relative min-h-screen flex-1">
        <div className="pointer-events-none absolute left-0 top-0 h-full w-full bg-[radial-gradient(circle_at_30%_20%,#1e1b4b_0%,transparent_50%)] opacity-20" />

        <header className="sticky top-0 z-30 border-b border-white/5 bg-[#09090b]/90 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl border border-white/10 p-2 text-zinc-200 transition hover:border-white/20 hover:bg-white/5"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-premium">
                <Zap className="h-5 w-5 fill-current text-white" />
              </div>
              <span className="text-sm font-semibold tracking-tight text-white">Agent Admin</span>
            </div>
          </div>
        </header>

        <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
