"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

export function FormModal({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#2D3138]/45 p-4 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-2xl rounded-[28px] border border-[#E6DFC9] bg-white p-6 shadow-2xl dark:bg-[#373635]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-[#2D3138] dark:text-[#FFF7DF]">{title}</h3>
            {description ? <p className="mt-1 text-sm text-[#5F5A51] dark:text-[#EACD7D]">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-[#EACD7D] p-2 text-[#6F6658] transition hover:bg-[#F1C36D]/20 dark:text-[#EACD7D]"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
