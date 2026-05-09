export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900/80 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.28em] text-sky-300">Shopify RAG Admin</p>
        <h1 className="mt-4 text-3xl font-semibold">Admin dashboard ready</h1>
        <p className="mt-3 text-sm text-slate-400">
          Open the protected dashboard routes under <code>/admin</code> to manage chats, analytics,
          Shopify sync, and RAG tuning.
        </p>
        <a
          className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-medium text-slate-950"
          href="/admin/login"
        >
          Go to admin login
        </a>
      </div>
    </div>
  );
}
