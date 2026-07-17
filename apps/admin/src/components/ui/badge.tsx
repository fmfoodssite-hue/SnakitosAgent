import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "default" | "success" | "warning" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
        tone === "default" && "bg-[#E3BE2F]/18 text-[#8A5A18] dark:text-[#F1C36D]",
        tone === "success" && "bg-emerald-500/10 text-emerald-300",
        tone === "warning" && "bg-amber-500/10 text-amber-300",
        tone === "danger" && "bg-red-500/10 text-red-300",
        className,
      )}
      {...props}
    />
  );
}
