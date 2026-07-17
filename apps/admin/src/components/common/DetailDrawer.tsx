"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function DetailDrawer({
  open,
  title,
  subtitle,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className={cn("fixed inset-0 z-[65] transition", open ? "pointer-events-auto" : "pointer-events-none")}>
      <div
        className={cn(
          "absolute inset-0 bg-[#2D3138]/35 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute right-0 top-0 h-full w-full max-w-xl transform overflow-y-auto border-l border-[#E6DFC9] bg-white p-6 shadow-2xl transition-transform dark:bg-[#373635]",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-[#2D3138] dark:text-[#FFF7DF]">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm text-[#5F5A51] dark:text-[#EACD7D]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-[#EACD7D] p-2 text-[#6F6658] transition hover:bg-[#F1C36D]/20 dark:text-[#EACD7D]"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
