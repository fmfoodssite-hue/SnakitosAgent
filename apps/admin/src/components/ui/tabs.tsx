import * as React from "react";
import { cn } from "@/lib/utils";

export function Tabs({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-4", className)} {...props} />;
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("inline-flex rounded-2xl border border-[#E6DFC9] bg-white p-1 dark:border-[#E3BE2F]/25 dark:bg-[#373635]", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("rounded-xl px-3 py-2 text-sm text-[#373635] hover:bg-[#F1C36D]/20 dark:text-[#FFF7DF] dark:hover:bg-[#E3BE2F]/15", className)} {...props} />;
}

export function TabsContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(className)} {...props} />;
}

