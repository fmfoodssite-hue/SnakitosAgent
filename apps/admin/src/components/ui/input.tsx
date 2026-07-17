import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-2xl border border-[#D8D4C8] bg-white px-4 text-sm font-medium text-[#2D3138] outline-none transition placeholder:text-[#8A8A84] focus:border-[#C4862D] focus:ring-4 focus:ring-[#E3BE2F]/20 dark:bg-[#373635] dark:text-[#FFF7DF] dark:placeholder:text-[#EACD7D]/70",
        className,
      )}
      {...props}
    />
  );
}
