"use client";

import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "destructive",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "destructive" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2D3138]/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-[#E6DFC9] bg-white p-6 shadow-2xl dark:bg-[#373635]">
        <h3 className="text-xl font-semibold text-[#2D3138] dark:text-[#FFF7DF]">{title}</h3>
        <p className="mt-2 text-sm text-[#5F5A51] dark:text-[#EACD7D]">{description}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "destructive" ? "destructive" : "default"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
