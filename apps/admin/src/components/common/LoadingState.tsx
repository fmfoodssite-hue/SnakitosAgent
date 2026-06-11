export function LoadingState({ label = "Loading dashboard data..." }: { label?: string }) {
  return (
    <div className="space-y-4">
      <div className="h-8 w-72 animate-pulse rounded-2xl bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-[28px] bg-slate-200" />
        ))}
      </div>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
