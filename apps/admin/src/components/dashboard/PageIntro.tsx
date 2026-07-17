export function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#EACD7D]">{eyebrow}</p>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#2D3138] dark:text-[#FFF7DF]">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#5F5A51] dark:text-[#FFF7DF]/75">{description}</p>
      </div>
    </div>
  );
}
