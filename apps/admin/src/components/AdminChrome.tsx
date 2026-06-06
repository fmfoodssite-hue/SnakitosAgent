"use client";

import React from "react";
import Sidebar from "@/components/Sidebar";

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-[#09090b] text-zinc-100">
      <Sidebar
        mobileOpen={mobileOpen}
        onOpen={() => setMobileOpen(true)}
        onClose={() => setMobileOpen(false)}
      />
      <main className="relative min-h-screen flex-1">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(24,24,27,0.9),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(79,70,229,0.16),transparent_22%),linear-gradient(180deg,rgba(9,9,11,0),rgba(9,9,11,0.9))]" />
        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-20 sm:px-6 md:px-8 md:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}

