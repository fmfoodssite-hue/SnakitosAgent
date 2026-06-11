import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const toneMap: Record<Tone, string> = {
  default: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
  danger: "bg-rose-50 text-rose-700 ring-rose-100",
  info: "bg-sky-50 text-sky-700 ring-sky-100",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
};

function resolveTone(value: string): Tone {
  const normalized = value.toLowerCase();
  if (["indexed", "healthy", "active", "resolved", "success", "included"].includes(normalized)) return "success";
  if (["open"].includes(normalized)) return "info";
  if (["pending", "warning", "low stock"].includes(normalized)) return "warning";
  if (["failed", "error", "disabled", "ignored", "out of stock", "excluded", "closed"].includes(normalized)) return "danger";
  if (["viewer", "manual", "faq"].includes(normalized)) return "neutral";
  return "default";
}

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
        toneMap[resolveTone(value)],
        className,
      )}
    >
      {value}
    </span>
  );
}
