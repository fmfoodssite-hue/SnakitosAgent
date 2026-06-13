import Link from "next/link";
import { redirect } from "next/navigation";

function normalizeAdminUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildTargetPath(slug: string[] | undefined): string {
  if (!slug || slug.length === 0) {
    return "";
  }

  return `/${slug.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

type AdminRedirectPageProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

export default async function AdminRedirectPage({ params }: AdminRedirectPageProps) {
  const resolvedParams = await params;
  const configuredAdminUrl = process.env.ADMIN_APP_URL?.trim();
  const slugPath = buildTargetPath(resolvedParams.slug);

  if (configuredAdminUrl) {
    redirect(`${normalizeAdminUrl(configuredAdminUrl)}${slugPath}`);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6f7f2_0%,#eef4e6_100%)] px-6 py-16 text-slate-900">
      <div className="mx-auto max-w-2xl rounded-[32px] border border-slate-200 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-800">
          Admin Access
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          Admin console is deployed separately
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          This root deployment serves the public chatbot. To open the admin console from this
          path, set <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">ADMIN_APP_URL</code> in
          Vercel to your admin deployment URL, for example
          {" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">
            https://your-admin-project.vercel.app/admin
          </code>
          .
        </p>
        <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-700">
          <p>
            Once <code className="rounded bg-white px-1.5 py-0.5">ADMIN_APP_URL</code> is configured,
            requests to <code className="rounded bg-white px-1.5 py-0.5">/admin</code> on this deployment
            will redirect automatically.
          </p>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Open chatbot
          </Link>
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
          >
            Open Vercel settings
          </a>
        </div>
      </div>
    </main>
  );
}
