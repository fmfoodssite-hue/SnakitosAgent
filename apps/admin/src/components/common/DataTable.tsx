"use client";

import type { ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DataTable<TData>({
  columns,
  data,
  emptyState,
}: {
  columns: ColumnDef<TData>[];
  data: TData[];
  emptyState?: ReactNode;
}) {
  // TanStack Table intentionally returns imperative helpers that React Compiler cannot memoize safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 6,
      },
    },
  });

  if (!data.length && emptyState) return <>{emptyState}</>;

  return (
    <div className="rounded-[28px] border border-[#E6DFC9] bg-white shadow-[0_12px_40px_rgba(45,49,56,0.06)] dark:border-[#E3BE2F]/25 dark:bg-[#373635]">
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="border-b border-[#EEE8D8] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-[#6B6252] dark:border-[#E3BE2F]/25 dark:text-[#EACD7D]"
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="transition hover:bg-[#FAF7EF] dark:hover:bg-[#E3BE2F]/10">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="border-b border-[#F2EDE0] px-4 py-4 align-top text-sm font-medium text-[#2D3138] dark:border-[#E3BE2F]/15 dark:text-[#FFF7DF]/85">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm font-medium text-[#5F5F5D] dark:text-[#EACD7D]">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
