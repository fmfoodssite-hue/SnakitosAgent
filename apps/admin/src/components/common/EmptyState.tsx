import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-dashed border-[#E6DFC9] bg-white px-6 py-10 text-center dark:bg-[#373635]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FAFAF8] text-[#C4862D] shadow-sm">
        <Inbox className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-[#2D3138] dark:text-[#FFF7DF]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[#5F5A51] dark:text-[#FFF7DF]/75">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
