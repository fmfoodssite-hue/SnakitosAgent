"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, Menu, MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useAdminShell } from "@/hooks/use-admin-shell";
import { withAdminApiPath, withAdminPath } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function TopNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { currentUser, logout, setMobileSidebarOpen } = useAdminShell();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const unreadCount = useMemo(() => 2, []);
  const activeTheme = mounted ? resolvedTheme ?? "light" : "light";

  useEffect(() => {
    setMounted(true);
  }, []);

  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-30 h-[104px] shrink-0 border-b border-[#E6DFC9] bg-white/95 backdrop-blur dark:border-[#E3BE2F]/25 dark:bg-[#373635]/90">
      <div className="flex h-full items-center gap-3 px-4 md:px-6">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className="inline-flex rounded-2xl border border-[#EACD7D] p-2 text-[#6F6658] md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

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
              <div className="absolute right-0 mt-2 w-80 rounded-[24px] border border-[#E6DFC9] bg-white p-4 shadow-2xl dark:bg-[#373635]">
                <div className="mb-3 text-sm font-semibold text-[#2D3138] dark:text-[#FFF7DF]">Notifications</div>
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
              const nextTheme = activeTheme === "dark" ? "light" : "dark";
              setTheme(nextTheme);
              toast.success(`Switched to ${nextTheme} mode.`);
            }}
            aria-label={`Switch to ${activeTheme === "dark" ? "light" : "dark"} mode`}
          >
            {activeTheme === "dark" ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
          </Button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((value) => !value)}
              className="flex items-center gap-3 rounded-2xl border border-[#E6DFC9] bg-white px-3 py-2 shadow-sm dark:bg-[#373635]"
            >
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#E3BE2F] to-[#C4862D] text-sm font-semibold text-[#2D3138]">
                {currentUser?.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt={`${currentUser.name} profile`} className="h-full w-full object-cover" />
                ) : (
                  currentUser?.avatar ?? "AI"
                )}
              </div>
              <div className="hidden text-left md:block">
                <div className="text-sm font-semibold text-[#2D3138] dark:text-[#FFF7DF]">{currentUser?.name ?? "Snakitos Admin"}</div>
                <div className="text-xs text-[#6F6658] dark:text-[#EACD7D]">{currentUser?.role ?? "Owner"}</div>
              </div>
              <ChevronDown className="h-4 w-4 text-[#C4862D]" />
            </button>
            {profileOpen ? (
              <div className="absolute right-0 mt-2 w-56 rounded-[24px] border border-[#E6DFC9] bg-white p-2 shadow-2xl dark:bg-[#373635]">
                {[
                  {
                    label: "Profile",
                    action: () => {
                      setProfileOpen(false);
                      router.push(withAdminPath("/profile"));
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
                    action: async () => {
                      setProfileOpen(false);
                      await fetch(withAdminApiPath("/api/auth/logout"), { method: "POST" }).catch(() => undefined);
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
                      "flex w-full rounded-2xl px-3 py-2 text-left text-sm text-[#373635] transition hover:bg-[#F1C36D]/20 dark:text-[#FFF7DF] dark:hover:bg-[#E3BE2F]/15",
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
