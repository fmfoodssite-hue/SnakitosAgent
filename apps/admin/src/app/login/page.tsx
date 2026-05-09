"use client";

import React, { useState } from "react";
import { Zap, Lock, ArrowRight, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

const adminBasePath = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH || "/apps/admin";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);

    try {
      const res = await fetch(`${adminBasePath}/api/auth/login`, {
        method: "POST",
        body: JSON.stringify({ password }),
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b] p-4">
      <div className="pointer-events-none absolute left-0 top-0 h-full w-full bg-[radial-gradient(circle_at_50%_50%,#1e1b4b_0%,transparent_50%)] opacity-30" />

      <div className="relative w-full max-w-md">
        <div className="glass-card rounded-3xl border-white/5 p-6 shadow-2xl sm:p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-premium shadow-lg shadow-indigo-500/20">
              <Zap className="h-8 w-8 fill-current text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Admin Access</h1>
            <p className="mt-2 text-sm text-zinc-500">Secure dashboard for Snakitos Agent management</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="ml-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Security Key
              </label>
              <div className="group relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-indigo-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  placeholder="Enter your admin secret..."
                  className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-12 pr-4 text-white transition-all placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="animate-shake flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                <p>Invalid admin key. Access denied.</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 font-bold text-white transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98] hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  Authenticate
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-xs uppercase tracking-[0.2em] text-zinc-600">
          Restricted Area - Unauthorized access is logged
        </p>
      </div>
    </div>
  );
}
