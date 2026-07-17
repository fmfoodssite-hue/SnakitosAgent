"use client";

import React from "react";
import Sidebar from "@/components/Sidebar";

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-white text-[#2D3138] dark:bg-[radial-gradient(circle_at_top_left,rgba(227,190,47,0.18),transparent_28%),linear-gradient(180deg,#2D3138_0%,#373635_100%)] dark:text-[#FFF7DF]">
      <Sidebar
        mobileOpen={mobileOpen}
        onOpen={() => setMobileOpen(true)}
        onClose={() => setMobileOpen(false)}
      />
      <main className="relative min-h-screen flex-1">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(227,190,47,0.18),transparent_24%)]" />
        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-20 sm:px-6 md:px-8 md:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
