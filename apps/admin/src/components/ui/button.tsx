import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
};

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition",
        variant === "default" && "bg-indigo-500 text-white hover:bg-indigo-400",
        variant === "secondary" && "bg-white/8 text-white hover:bg-white/12",
        variant === "outline" && "border border-white/10 bg-transparent text-white hover:bg-white/5",
        variant === "ghost" && "text-zinc-300 hover:bg-white/5",
        variant === "destructive" && "bg-red-500/90 text-white hover:bg-red-500",
        className,
      )}
      {...props}
    />
  );
}

