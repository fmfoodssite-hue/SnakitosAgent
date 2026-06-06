import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none focus:border-indigo-400/50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

