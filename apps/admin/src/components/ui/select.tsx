import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-2xl border border-[#D8D4C8] bg-white px-4 text-sm font-medium text-[#2D3138] outline-none transition focus:border-[#C4862D] focus:ring-4 focus:ring-[#E3BE2F]/20 dark:bg-[#373635] dark:text-[#FFF7DF]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
