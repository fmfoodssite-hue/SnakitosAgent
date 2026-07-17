import * as React from "react";
import { cn } from "@/lib/utils";

export function Dialog({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function DialogContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-3xl border border-[#E6DFC9] bg-white p-6 text-[#2D3138] dark:border-[#E3BE2F]/25 dark:bg-[#373635] dark:text-[#FFF7DF]", className)} {...props} />;
}

