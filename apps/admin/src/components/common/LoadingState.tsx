export function LoadingState({ label = "Loading dashboard data..." }: { label?: string }) {
  return (
    <div className="space-y-4">
      <div className="h-8 w-72 animate-pulse rounded-2xl bg-[#EACD7D]/55" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-[28px] bg-[#EACD7D]/45" />
        ))}
      </div>
      <p className="text-sm text-[#6F6658] dark:text-[#EACD7D]">{label}</p>
    </div>
  );
}
