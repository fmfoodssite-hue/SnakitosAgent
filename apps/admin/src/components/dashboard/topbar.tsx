"use client";

import { useRouter } from "next/navigation";
import { Bell, LogOut, MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function DashboardTopbar({
  storeName,
  adminName,
}: {
  storeName: string;
  adminName: string;
}) {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") {
      return "dark";
    }

    return window.localStorage.getItem("admin-theme") === "light" ? "light" : "dark";
  });
  const router = useRouter();

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("light", nextTheme === "light");
    window.localStorage.setItem("admin-theme", nextTheme);
    setTheme(nextTheme);
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Badge variant="secondary">{storeName}</Badge>
        <h2 className="mt-3 text-3xl font-semibold text-white">Admin dashboard</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Tune your AI commerce assistant, keep Shopify in sync, and watch performance in real time.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="secondary" size="icon" onClick={toggleTheme}>
          {theme === "dark" ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
        </Button>
        <Button variant="secondary" size="icon">
          <Bell className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <Avatar>
            <AvatarFallback>{adminName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-white">{adminName}</p>
            <p className="text-xs text-slate-400">Administrator</p>
          </div>
        </div>
        <Button variant="ghost" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}
