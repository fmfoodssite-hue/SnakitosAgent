import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const toneMap: Record<Tone, string> = {
  default: "bg-[#E3BE2F]/18 text-[#8A5A18] ring-[#E3BE2F]/35 dark:text-[#F1C36D]",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-[#F1C36D]/24 text-[#8A5A18] ring-[#E9C07C]/60 dark:text-[#F1C36D]",
  danger: "bg-rose-50 text-rose-700 ring-rose-100",
  info: "bg-[#EACD7D]/25 text-[#C4862D] ring-[#EACD7D]/70 dark:text-[#F1C36D]",
  neutral: "bg-[#373635]/8 text-[#373635] ring-[#373635]/12 dark:bg-[#FFF7DF]/10 dark:text-[#FFF7DF]",
};

function resolveTone(value: string): Tone {
  const normalized = value.toLowerCase();
  if (["indexed", "healthy", "active", "resolved", "success", "included", "admin"].includes(normalized)) return "success";
  if (["open", "owner", "super admin", "manager"].includes(normalized)) return "info";
  if (["pending", "warning", "low stock"].includes(normalized)) return "warning";
  if (["failed", "error", "disabled", "ignored", "out of stock", "excluded", "closed"].includes(normalized)) return "danger";
  if (["viewer", "manual", "faq", "student"].includes(normalized)) return "neutral";
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
