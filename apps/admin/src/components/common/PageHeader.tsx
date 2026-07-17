import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-2">
        {eyebrow ? <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#C4862D] dark:text-[#F1C36D]">{eyebrow}</div> : null}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#2D3138] dark:text-[#FFF7DF]">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-[#5F5A51] dark:text-[#FFF7DF]/75">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}
