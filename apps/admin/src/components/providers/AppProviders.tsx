"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
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
