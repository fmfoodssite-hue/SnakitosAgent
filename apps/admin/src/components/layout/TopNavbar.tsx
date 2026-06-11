"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, Menu, MoonStar, Search, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useAdminShell } from "@/hooks/use-admin-shell";
import { withAdminPath } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function TopNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { currentUser, logout, setMobileSidebarOpen } = useAdminShell();
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const unreadCount = useMemo(() => 2, []);

  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-4 md:px-6">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className="inline-flex rounded-2xl border border-slate-200 p-2 text-slate-600 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="relative hidden max-w-xl flex-1 md:block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                toast.success(`Searched for "${search || "all items"}" across knowledge, conversations, and products.`);
              }
            }}
            placeholder="Search knowledge, conversations, products..."
            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Button variant="outline" onClick={() => setNotificationsOpen((value) => !value)} className="relative">
              <Bell className="h-4 w-4" />
              {unreadCount ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              ) : null}
            </Button>
            {notificationsOpen ? (
              <div className="absolute right-0 mt-2 w-80 rounded-[24px] border border-slate-200 bg-white p-4 shadow-2xl">
                <div className="mb-3 text-sm font-semibold text-slate-950">Notifications</div>
                <div className="space-y-3">
                  <div className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">Refund policy crawl failed and needs a retry.</div>
                  <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">Offer PDF is pending embedding refresh.</div>
                  <Button variant="ghost" className="w-full" onClick={() => toast.success("All notifications marked as read.")}>
                    Mark all as read
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <Button
            variant="outline"
            onClick={() => {
              setTheme(theme === "dark" ? "light" : "dark");
              toast.success(`Switched to ${theme === "dark" ? "light" : "dark"} mode.`);
            }}
          >
            {theme === "dark" ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
          </Button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((value) => !value)}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 text-sm font-semibold text-white">
                {currentUser?.avatar ?? "AI"}
              </div>
              <div className="hidden text-left md:block">
                <div className="text-sm font-semibold text-slate-950">{currentUser?.name ?? "Snakitos Admin"}</div>
                <div className="text-xs text-slate-500">{currentUser?.role ?? "Owner"}</div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
            {profileOpen ? (
              <div className="absolute right-0 mt-2 w-56 rounded-[24px] border border-slate-200 bg-white p-2 shadow-2xl">
                {[
                  {
                    label: "Profile",
                    action: () => {
                      setProfileOpen(false);
                      router.push(withAdminPath("/users"));
                      toast.success("Opened Users & Roles to view the current admin profile.");
                    },
                  },
                  {
                    label: "Settings",
                    action: () => {
                      setProfileOpen(false);
                      router.push(withAdminPath("/settings"));
                    },
                  },
                  {
                    label: "Logout",
                    action: () => {
                      setProfileOpen(false);
                      logout();
                      toast.success("You have been logged out.");
                      router.push(withAdminPath("/login"));
                    },
                  },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={cn(
                      "flex w-full rounded-2xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50",
                      item.label === "Logout" && "text-rose-600",
                    )}
                    onClick={item.action}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
