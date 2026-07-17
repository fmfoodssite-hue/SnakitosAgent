import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
};

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        variant === "default" && "bg-[#E3BE2F] text-[#2D3138] shadow-sm shadow-[#C4862D]/20 hover:bg-[#EEB645]",
        variant === "secondary" && "bg-[#373635] text-[#F1C36D] hover:bg-[#2D3138]",
        variant === "outline" && "border border-[#D8D4C8] bg-white text-[#373635] hover:bg-[#FAF7EF] dark:bg-[#373635] dark:text-[#FFF7DF] dark:hover:bg-[#2D3138]",
        variant === "ghost" && "text-[#373635] hover:bg-[#F1C36D]/25 dark:text-[#FFF7DF] dark:hover:bg-[#E3BE2F]/15",
        variant === "destructive" && "bg-rose-600 text-white hover:bg-rose-500",
        className,
      )}
      {...props}
    />
  );
}
