"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchAndFilterBar({
  search,
  onSearchChange,
  filters,
  actions,
  placeholder = "Search...",
}: {
  search: string;
  onSearchChange: (value: string) => void;
  filters?: ReactNode;
  actions?: ReactNode;
  placeholder?: string;
}) {
  return (
    <div className="rounded-[28px] border border-[#E6DFC9] bg-white p-4 shadow-[0_12px_40px_rgba(45,49,56,0.06)] dark:border-[#E3BE2F]/25 dark:bg-[#373635]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C4862D]" />
            <Input className="pl-11" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={placeholder} />
          </div>
          {filters ? <div className="flex flex-wrap items-center gap-3">{filters}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
