"use client";

import React from "react";
import { ArrowRight, ShieldAlert, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { ADMIN_BASE_PATH } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${ADMIN_BASE_PATH}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Unable to login");
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Unable to login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b] px-4 py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.16),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.08),transparent_28%)]" />
      <div className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0f0f12]/90 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="mb-8">
          <div className="mb-4 inline-flex rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-indigo-200">
            Secure Admin
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Snakitos RAG Dashboard</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Role-based access for prompts, knowledge, chats, handoffs, and Shopify sync.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input
            type="email"
            placeholder="owner@snakitos.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {error ? (
            <div className="flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <ShieldAlert className="h-4 w-4" />
              <span>{error}</span>
            </div>
          ) : null}

          <Button type="submit" className="w-full py-3" disabled={loading}>
            {loading ? "Signing In..." : "Sign In"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>

        <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-zinc-400">
          <div className="flex items-center gap-2 text-zinc-200">
            <Sparkles className="h-4 w-4 text-indigo-300" />
            Bootstrap owner
          </div>
          <p className="mt-2">
            Set `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` in the environment to create the first owner automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

