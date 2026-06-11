"use client";

import { create } from "zustand";
import type { AdminUser } from "@/types";

const SESSION_COOKIE = "snakitos_admin_session";
const USER_STORAGE_KEY = "snakitos_admin_user";

type ShellState = {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  currentUser: AdminUser | null;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  hydrateUser: () => void;
  setCurrentUser: (user: AdminUser | null) => void;
  logout: () => void;
};

function setSessionCookie(value: string | null) {
  if (typeof document === "undefined") return;
  if (value) {
    document.cookie = `${SESSION_COOKIE}=${value}; path=/admin; max-age=604800; SameSite=Lax`;
  } else {
    document.cookie = `${SESSION_COOKIE}=; path=/admin; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  }
}

export const useAdminShell = create<ShellState>((set) => ({
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  currentUser: null,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  hydrateUser: () => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return;
    try {
      set({ currentUser: JSON.parse(raw) as AdminUser });
      setSessionCookie("active");
    } catch {
      window.localStorage.removeItem(USER_STORAGE_KEY);
    }
  },
  setCurrentUser: (user) => {
    if (typeof window !== "undefined") {
      if (user) {
        window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
        setSessionCookie("active");
      } else {
        window.localStorage.removeItem(USER_STORAGE_KEY);
        setSessionCookie(null);
      }
    }
    set({ currentUser: user });
  },
  logout: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(USER_STORAGE_KEY);
    }
    setSessionCookie(null);
    set({ currentUser: null });
  },
}));

