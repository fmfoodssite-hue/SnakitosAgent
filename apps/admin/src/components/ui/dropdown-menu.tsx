import * as React from "react";
import { cn } from "@/lib/utils";

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function DropdownMenuContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-[#E6DFC9] bg-white p-2 text-[#2D3138] dark:border-[#E3BE2F]/25 dark:bg-[#373635] dark:text-[#FFF7DF]", className)} {...props} />;
}

