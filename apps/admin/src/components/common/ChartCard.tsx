import type { ReactNode } from "react";

export function ChartCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-[#E6DFC9] bg-white p-5 shadow-[0_12px_40px_rgba(45,49,56,0.06)] dark:border-[#E3BE2F]/25 dark:bg-[#373635]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[#2D3138] dark:text-[#FFF7DF]">{title}</h3>
          {description ? <p className="mt-1 text-sm text-[#4B4B49] dark:text-[#EACD7D]">{description}</p> : null}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  );
}
