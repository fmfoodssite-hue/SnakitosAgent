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
      <body className="flex min-h-screen items-center justify-center bg-[#09090b] px-4 text-zinc-100">
        <div className="glass-card w-full max-w-lg rounded-3xl border-white/10 p-8 text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-indigo-400">Admin Dashboard</p>
          <h1 className="mt-4 text-3xl font-semibold">Something went wrong</h1>
          <p className="mt-3 text-sm text-zinc-400">
            {error.message || "An unexpected error interrupted the admin dashboard."}
          </p>
          <button
            type="button"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white"
            onClick={() => reset()}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
