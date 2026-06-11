"use client";

import { create } from "zustand";
import type { AdminUser } from "@/types";

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
    } catch {
      window.localStorage.removeItem(USER_STORAGE_KEY);
    }
  },
  setCurrentUser: (user) => {
    if (typeof window !== "undefined") {
      if (user) {
        window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      } else {
        window.localStorage.removeItem(USER_STORAGE_KEY);
      }
    }
    set({ currentUser: user });
  },
  logout: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(USER_STORAGE_KEY);
    }
    set({ currentUser: null });
  },
}));
