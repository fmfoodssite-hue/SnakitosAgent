"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/80 p-8 text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-sky-300">Admin Dashboard</p>
          <h1 className="mt-4 text-3xl font-semibold">Something went wrong</h1>
          <p className="mt-3 text-sm text-slate-400">
            {error.message || "An unexpected error interrupted the admin experience."}
          </p>
          <button
            type="button"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-medium text-slate-950"
            onClick={() => reset()}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
