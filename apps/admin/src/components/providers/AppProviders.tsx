"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLoginPath = pathname === "/login" || pathname.endsWith("/login");

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="snakitos-admin-theme"
      forcedTheme={isLoginPath ? "light" : undefined}
      disableTransitionOnChange
    >
      {children}
      <Toaster
        richColors
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: "16px",
          },
        }}
      />
    </ThemeProvider>
  );
}
