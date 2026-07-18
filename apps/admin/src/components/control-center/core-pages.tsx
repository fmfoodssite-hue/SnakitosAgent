"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";
import { RefreshCw, Save } from "lucide-react";
import {
  saveBudgetSettings,
  saveGuardrails,
  saveModelSettings,
  saveSettings,
} from "@/lib/mock-api";
import { withAdminApiPath, withAdminPath } from "@/lib/constants";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useAdminShell } from "@/hooks/use-admin-shell";
import { useControlCenterData } from "@/hooks/use-control-center-data";
import { ChartCard } from "@/components/common/ChartCard";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { MetricCard } from "@/components/common/MetricCard";
import { PageHeader } from "@/components/common/PageHeader";
import { PasswordInput } from "@/components/common/PasswordInput";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SettingsState } from "@/types";

const CHART_PRIMARY = "#E3BE2F";
const CHART_SECONDARY = "#C4862D";
const CHART_ACCENT = "#EEB645";
const CHART_WARM = "#EFB249";
const CHART_GRID = "#EACD7D";
const CHART_AXIS = "#8A6B2E";
const CHART_PALETTE = ["#E3BE2F", "#C4862D", "#EEB645", "#EFB249", "#EAB861", "#F1C36D", "#E9C07C"];

function PageState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: string | null;
  retry: () => void;
  children: React.ReactNode;
}) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} retry={retry} />;
  return <>{children}</>;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <div>
        <div className="text-sm font-semibold text-[#373635] dark:text-[#FFF7DF]">{label}</div>
        {hint ? <div className="text-xs text-[#6B6B68] dark:text-[#EACD7D]">{hint}</div> : null}
      </div>
      {children}
    </label>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="mt-1 text-sm text-slate-500">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-1 inline-flex h-7 w-12 rounded-full transition ${checked ? "bg-[#E3BE2F]" : "bg-[#EACD7D]"}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`}
        />
      </button>
    </div>
  );
}

const loginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  remember: z.boolean(),
});

export function LoginPage() {
  const router = useRouter();
  const { setCurrentUser } = useAdminShell();
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: true,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const response = await fetch(withAdminApiPath("/api/auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        admin?: {
          id: string;
          email: string;
          full_name: string;
          role: "owner" | "admin" | "support_agent" | "content_manager" | "viewer";
          last_login_at?: string | null;
          avatar_url?: string | null;
          permissions?: string[];
        };
      };

      if (!response.ok || !payload.admin) {
        throw new Error(payload.error || "Login failed.");
      }

      const roleLabelMap = {
        owner: "Owner",
        admin: "Admin",
        support_agent: "Support Agent",
        content_manager: "Content Manager",
        viewer: "Viewer",
      } as const;

      const initials = payload.admin.full_name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      const user = {
        id: payload.admin.id,
        name: payload.admin.full_name,
        email: payload.admin.email,
        role: roleLabelMap[payload.admin.role],
        status: "Active" as const,
        lastActive: payload.admin.last_login_at ?? "Just now",
        avatar: initials || "SA",
        avatarUrl: payload.admin.avatar_url,
        permissions: payload.admin.permissions ?? [],
      };

      setCurrentUser(user);
      toast.success("Welcome back to Snakitos RAG Control Center.");
      router.push(withAdminPath("/dashboard"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed.");
    }
  });

  return (
    <div className="flex h-dvh bg-white">
      <div className="hidden bg-[#2D3138] lg:block lg:w-1/3">
        <div className="flex h-full flex-col items-center justify-center p-12 text-center">
          <div className="space-y-6 rounded-[36px] border border-[#E3BE2F]/20 bg-[radial-gradient(circle_at_top,rgba(227,190,47,0.18),transparent_58%)] p-10">
            <div className="mx-auto flex items-center justify-center">
              <Image
                src="/Snakitos_Logo_white.webp"
                alt="Snakitos"
                width={112}
                height={38}
                priority
                className="h-auto w-28 object-contain drop-shadow-[0_10px_30px_rgba(227,190,47,0.22)]"
              />
            </div>
            <div className="space-y-2">
              <h1 className="text-5xl font-light leading-tight text-white">
                Snakitos RAG Control Center
              </h1>
              <p className="text-xl text-white/80">
                Manage ingestion, retrieval quality, prompt behavior, answer reviews, and support escalation for the Snakitos customer support RAG assistant.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-center bg-white p-8 lg:w-2/3">
        <div className="w-full max-w-md space-y-10 py-24 lg:py-32">
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <Image
                src="/Snakitos_Logo_black.png"
                alt="Snakitos"
                width={190}
                height={64}
                priority
                className="h-auto w-44 object-contain"
              />
            </div>
            <div className="mx-auto max-w-xl text-[#6F6658]">
              Role-based access for owners, admins, support, and content teams
            </div>
          </div>

          <div className="space-y-4">
            <form className="space-y-5" onSubmit={onSubmit}>
            <Field label="Email">
              <Input type="email" placeholder="owner@snakitos.com" {...form.register("email")} />
              {form.formState.errors.email ? <p className="text-sm text-rose-600">{form.formState.errors.email.message}</p> : null}
            </Field>

            <Field label="Password">
              <PasswordInput placeholder="Enter your password" autoComplete="current-password" {...form.register("password")} />
              {form.formState.errors.password ? <p className="text-sm text-rose-600">{form.formState.errors.password.message}</p> : null}
            </Field>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-[#4B4B49]">
                <input type="checkbox" className="h-4 w-4 rounded border-[#D8D4C8] accent-[#C4862D]" {...form.register("remember")} />
                Remember me
              </label>
              <button type="button" className="text-sm font-medium text-[#C4862D] transition hover:text-[#8A5A18]" onClick={() => toast.info("Password reset flow can be connected to your auth provider later.")}>
                Forgot password?
              </button>
            </div>

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Signing in..." : "Login"}
            </Button>
            </form>

            <div className="rounded-3xl border border-[#E6DFC9] bg-white p-4 text-sm text-[#4B4B49] shadow-sm">
              <div className="font-medium text-[#2D3138]">Production access</div>
              <div className="mt-1">
                Sign in with a real admin account provisioned in the Snakitos admin database. Demo credentials are no longer used by this screen.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader
            eyebrow="Control Center"
            title="Snakitos RAG performance at a glance"
            description="Track answer quality, trained knowledge coverage, retrieval performance, and support operations from one RAG control surface."
            actions={
              <Button onClick={() => toast.success("RAG control center data refreshed.")}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            }
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.dashboardMetrics.map((metric) => (
              <MetricCard key={metric.title} metric={metric} />
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
            <ChartCard title="Queries over the last 7 days" description="Daily customer demand and support traffic">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.queriesLast7Days}>
                    <defs>
                      <linearGradient id="queryFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor={CHART_PRIMARY} stopOpacity={0.38} />
                        <stop offset="95%" stopColor={CHART_PRIMARY} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis dataKey="label" stroke={CHART_AXIS} />
                    <YAxis stroke={CHART_AXIS} />
                    <Tooltip />
                    <Area type="monotone" dataKey="value" stroke={CHART_PRIMARY} fill="url(#queryFill)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Source health" description="Live ingestion and retrieval readiness">
              <div className="space-y-4">
                {data.sourceHealth.map((source) => (
                  <div key={source.label} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">{source.label}</div>
                      <StatusBadge value={source.status} />
                    </div>
                    <div className="mt-2 text-sm text-slate-600">{source.detail}</div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr_0.9fr]">
            <ChartCard title="Top product questions" description="Most asked snack categories">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topProductQuestions}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis dataKey="label" stroke={CHART_AXIS} />
                    <YAxis stroke={CHART_AXIS} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[12, 12, 0, 0]} fill={CHART_PRIMARY} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Language distribution" description="English, Urdu, and Roman Urdu mix">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.languageDistribution} dataKey="value" nameKey="label" innerRadius={60} outerRadius={100}>
                      {data.languageDistribution.map((entry, index) => (
                        <Cell key={entry.label} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Weekly engagement" description="Reference-style mini performance bars">
              <div className="space-y-4">
                {data.engagementBars.map((point) => (
                  <div key={point.label}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{point.label}</span>
                      <span className="text-slate-500">{point.value}%</span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-100">
                      <div className="h-3 rounded-full bg-gradient-to-r from-[#E3BE2F] to-[#C4862D]" style={{ width: `${point.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          <ChartCard title="Recent activity" description="Operational timeline across ingestion, prompts, and support">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <th className="pb-3">Time</th>
                    <th className="pb-3">Event</th>
                    <th className="pb-3">Source</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.auditLogs.slice(0, 5).map((log) => (
                    <tr key={log.id} className="border-b border-slate-100">
                      <td className="py-4 text-sm text-slate-600">{log.time}</td>
                      <td className="py-4 text-sm font-medium text-slate-900">{log.action}</td>
                      <td className="py-4 text-sm text-slate-600">{log.module}</td>
                      <td className="py-4">
                        <StatusBadge value={log.status} />
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <Button variant="outline" onClick={() => setSelectedActivity(log.id)}>
                            View activity
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              log.status === "Error"
                                ? toast.success("Retry queued for the failed activity.")
                                : toast.info("This activity is already healthy.")
                            }
                          >
                            Retry
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedActivity ? (
              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                {data.auditLogs.find((item) => item.id === selectedActivity)?.action} from{" "}
                {data.auditLogs.find((item) => item.id === selectedActivity)?.module} was recorded at{" "}
                {data.auditLogs.find((item) => item.id === selectedActivity)?.time}.
              </div>
            ) : null}
          </ChartCard>
        </div>
      ) : null}
    </PageState>
  );
}

export function AnalyticsPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const cards = useMemo(
    () =>
      data
        ? [
            { label: "Total conversations", value: formatNumber(data.conversations.length) },
            { label: "Resolution rate", value: "87.5%" },
            { label: "Most searched product", value: "Spicy Chips" },
            { label: "Most common complaint", value: "Missing policy detail" },
            { label: "Best performing FAQ", value: "Contact support options" },
            { label: "Average satisfaction", value: "4.1 / 5" },
          ]
        : [],
    [data],
  );

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader
            eyebrow="Monitoring"
            title="Deep analytics for RAG performance"
            description="Explore customer demand, answer quality, language mix, cost trends, and intent distribution to guide retrieval and support improvements."
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <div key={card.label} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
                <div className="text-sm text-slate-500">{card.label}</div>
                <div className="mt-3 text-2xl font-semibold text-slate-950">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Query volume over time">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.queryVolume}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis dataKey="label" stroke={CHART_AXIS} />
                    <YAxis stroke={CHART_AXIS} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke={CHART_PRIMARY} strokeWidth={3} dot={{ fill: CHART_PRIMARY }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Top asked questions">
              <div className="space-y-3">
                {data.conversations.slice(0, 6).map((conversation) => (
                  <div key={conversation.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="font-medium text-slate-900">{conversation.question}</div>
                    <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                      <span>{conversation.language}</span>
                      <span>{conversation.confidence}% confidence</span>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Failed answer trend">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.failedAnswerTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis dataKey="label" stroke={CHART_AXIS} />
                    <YAxis stroke={CHART_AXIS} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[12, 12, 0, 0]} fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Language usage">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.languageDistribution} dataKey="value" nameKey="label" outerRadius={100}>
                      {data.languageDistribution.map((entry, index) => (
                        <Cell key={entry.label} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="User satisfaction trend">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.satisfactionTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis dataKey="label" stroke={CHART_AXIS} />
                    <YAxis stroke={CHART_AXIS} />
                    <Tooltip />
                    <Area type="monotone" dataKey="value" stroke={CHART_ACCENT} fill="#F7EFD8" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Token cost trend">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.tokenCostTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis dataKey="label" stroke={CHART_AXIS} />
                    <YAxis stroke={CHART_AXIS} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke={CHART_SECONDARY} strokeWidth={3} dot={{ fill: CHART_SECONDARY }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Product interest">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topProductQuestions}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis dataKey="label" stroke={CHART_AXIS} />
                    <YAxis stroke={CHART_AXIS} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[12, 12, 0, 0]} fill={CHART_WARM} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Intent distribution">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.intentDistribution} dataKey="value" nameKey="label" innerRadius={50} outerRadius={100}>
                      {data.intentDistribution.map((entry, index) => (
                        <Cell
                          key={entry.label}
                          fill={CHART_PALETTE[index % CHART_PALETTE.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
        </div>
      ) : null}
    </PageState>
  );
}

const tokenBudgetSchema = z.object({
  monthlyBudget: z.coerce.number().positive("Budget must be positive."),
  alertThreshold: z.coerce.number().min(1, "Threshold must be at least 1.").max(100, "Threshold cannot exceed 100."),
});

export function TokenUsagePage() {
  const { data, loading, error, reload } = useControlCenterData();
  const form = useForm<z.input<typeof tokenBudgetSchema>, unknown, z.output<typeof tokenBudgetSchema>>({
    resolver: zodResolver(tokenBudgetSchema),
    values: data
      ? {
          monthlyBudget: data.tokenBudget.monthlyBudget,
          alertThreshold: data.tokenBudget.alertThreshold,
        }
      : undefined,
  });

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader
            eyebrow="Monitoring"
            title="Token usage and cost monitoring"
            description="Track daily usage, conversation cost outliers, and budget protection settings for Snakitos AI operations."
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Daily token usage", value: formatNumber(data.tokenUsage.filter((item) => item.date === "2026-06-11").reduce((sum, item) => sum + item.tokensUsed, 0)) },
              { label: "Monthly estimated cost", value: formatCurrency(data.tokenUsage.reduce((sum, item) => sum + item.estimatedCost, 0), "USD") },
              { label: "Average tokens per query", value: `${Math.round(data.tokenUsage.reduce((sum, item) => sum + item.tokensUsed, 0) / data.tokenUsage.length)}` },
              { label: "Highest cost conversation", value: formatCurrency(Math.max(...data.tokenUsage.map((item) => item.estimatedCost)), "USD") },
              { label: "Budget remaining", value: formatCurrency(data.tokenBudget.monthlyBudget - data.tokenUsage.reduce((sum, item) => sum + item.estimatedCost, 0), "USD") },
            ].map((card) => (
              <div key={card.label} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
                <div className="text-sm text-slate-500">{card.label}</div>
                <div className="mt-3 text-2xl font-semibold text-slate-950">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Daily token usage">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.tokenCostTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis dataKey="label" stroke={CHART_AXIS} />
                    <YAxis stroke={CHART_AXIS} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[12, 12, 0, 0]} fill={CHART_PRIMARY} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Cost by model">
              <div className="space-y-4">
                {["gpt-4.1-mini", "gpt-4.1", "text-embedding-3-large"].map((model) => {
                  const total = data.tokenUsage.filter((item) => item.model === model).reduce((sum, item) => sum + item.estimatedCost, 0);
                  const width = Math.min(100, total * 1000);
                  return (
                    <div key={model}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{model}</span>
                        <span className="text-slate-500">{formatCurrency(total, "USD")}</span>
                      </div>
                      <div className="h-3 rounded-full bg-slate-100">
                        <div className="h-3 rounded-full bg-gradient-to-r from-[#E3BE2F] to-[#C4862D]" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ChartCard>
          </div>

          <ChartCard title="Expensive conversations" description="Highest token or embedding cost events">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <th className="pb-3">Conversation ID</th>
                    <th className="pb-3">Question</th>
                    <th className="pb-3">Tokens</th>
                    <th className="pb-3">Estimated cost</th>
                    <th className="pb-3">Model</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tokenUsage.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="py-4 text-sm font-medium text-slate-900">{item.conversationId}</td>
                      <td className="py-4 text-sm text-slate-600">{item.question}</td>
                      <td className="py-4 text-sm text-slate-600">{formatNumber(item.tokensUsed)}</td>
                      <td className="py-4 text-sm text-slate-600">{formatCurrency(item.estimatedCost, "USD")}</td>
                      <td className="py-4 text-sm text-slate-600">{item.model}</td>
                      <td className="py-4 text-sm text-slate-600">{item.date}</td>
                      <td className="py-4">
                        <Button variant="ghost" onClick={() => toast.info("Conversation cost review opened.")}>
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard title="Budget alert settings" description="Protect monthly AI spend with threshold warnings">
            <form
              className="grid gap-4 md:grid-cols-3"
              onSubmit={form.handleSubmit(async (values) => {
                await saveBudgetSettings(values.monthlyBudget, values.alertThreshold);
                toast.success("Budget settings saved.");
                reload();
              })}
            >
              <Field label="Monthly budget">
                <Input type="number" step="1" {...form.register("monthlyBudget")} />
                {form.formState.errors.monthlyBudget ? <p className="text-sm text-rose-600">{form.formState.errors.monthlyBudget.message}</p> : null}
              </Field>
              <Field label="Alert threshold %">
                <Input type="number" step="1" {...form.register("alertThreshold")} />
                {form.formState.errors.alertThreshold ? <p className="text-sm text-rose-600">{form.formState.errors.alertThreshold.message}</p> : null}
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  Save
                </Button>
              </div>
            </form>
          </ChartCard>
        </div>
      ) : null}
    </PageState>
  );
}

const modelSchema = z.object({
  chatModel: z.string().min(1),
  embeddingModel: z.string().min(1),
  temperature: z.coerce.number().min(0).max(1),
  maxTokens: z.coerce.number().min(100),
  similarityThreshold: z.coerce.number().min(0).max(1),
  topK: z.coerce.number().min(1).max(20),
  enableCitations: z.boolean(),
  enableFallbackAnswer: z.boolean(),
  enableStreaming: z.boolean(),
});

export function ModelSettingsPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const form = useForm<z.input<typeof modelSchema>, unknown, z.output<typeof modelSchema>>({
    resolver: zodResolver(modelSchema),
    values: data ? data.modelSettings : undefined,
  });

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader
            eyebrow="AI Control"
            title="Model and retrieval settings"
            description="Configure how Snakitos AI answers questions, retrieves chunks, and balances quality, speed, and cost."
          />

          <form
            className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
            onSubmit={form.handleSubmit(async (values) => {
              await saveModelSettings(values);
              toast.success("Model settings saved.");
              reload();
            })}
          >
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Chat model">
                <Select {...form.register("chatModel")}>
                  <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                  <option value="gpt-4.1">gpt-4.1</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                </Select>
              </Field>
              <Field label="Embedding model">
                <Select {...form.register("embeddingModel")}>
                  <option value="text-embedding-3-large">text-embedding-3-large</option>
                  <option value="text-embedding-3-small">text-embedding-3-small</option>
                </Select>
              </Field>
              <Field label="Temperature" hint="Higher values increase creativity but reduce consistency.">
                <Input type="number" min="0" max="1" step="0.1" {...form.register("temperature")} />
              </Field>
              <Field label="Max tokens">
                <Input type="number" min="100" step="50" {...form.register("maxTokens")} />
              </Field>
              <Field label="Similarity threshold" hint="Low thresholds may retrieve weaker sources.">
                <Input type="number" min="0" max="1" step="0.01" {...form.register("similarityThreshold")} />
              </Field>
              <Field label="Top K retrieval">
                <Input type="number" min="1" max="20" {...form.register("topK")} />
              </Field>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <Controller
                control={form.control}
                name="enableCitations"
                render={({ field }) => (
                  <ToggleField
                    label="Enable citations"
                    description="Show approved source references in admin diagnostics."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="enableFallbackAnswer"
                render={({ field }) => (
                  <ToggleField
                    label="Enable fallback answer"
                    description="Allow polite refusal when approved knowledge is missing."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="enableStreaming"
                render={({ field }) => (
                  <ToggleField
                    label="Enable streaming"
                    description="Use streaming responses for faster perceived latency."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>

            <div className="mt-6 grid gap-3">
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                High temperature may cause less consistent answers.
              </div>
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Low similarity threshold may retrieve weak sources.
              </div>
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Very high max tokens may increase cost.
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                <Save className="mr-2 h-4 w-4" />
                Save settings
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </PageState>
  );
}

export function GuardrailsPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [newTopic, setNewTopic] = useState("");

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader
            eyebrow="AI Control"
            title="Guardrails and hallucination prevention"
            description="Tune safe-answer behavior, blocked topics, and prompt injection handling for Snakitos customer support workflows."
          />

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
              {[
                ["blockHarmfulContent", "Block harmful content", "Refuse harmful or unsafe content requests."],
                ["blockNonSnakitosAnswers", "Block non-Snakitos answers", "Keep answers focused on approved Snakitos knowledge."],
                ["forceSourceCitation", "Force source citation", "Require source-backed answers in diagnostics."],
                ["refuseUnknownAnswers", "Refuse unknown answers", "Avoid guessing when the knowledge base does not support the answer."],
                ["detectPromptInjection", "Detect prompt injection", "Flag malicious attempts to override instructions."],
                ["limitPersonalDataCollection", "Limit personal data collection", "Prevent the bot from asking for unnecessary personal details."],
                ["enableProfanityFilter", "Enable profanity filter", "Reduce unsafe language exposure in responses."],
                ["blockCompetitorComparisons", "Block competitor comparisons", "Avoid unsupported comparisons with other brands."],
                ["blockFakeDiscountClaims", "Block fake discount claims", "Refuse unverified discount promises."],
                ["blockSensitiveAdvice", "Block medical/legal/financial advice", "Reject answers outside product support scope."],
              ].map(([key, label, description]) => (
                <ToggleField
                  key={key}
                  label={label}
                  description={description}
                  checked={data.guardrails[key as keyof typeof data.guardrails] as boolean}
                  onChange={async (checked) => {
                    await saveGuardrails({ ...data.guardrails, [key]: checked });
                    toast.success(`${label} updated.`);
                    reload();
                  }}
                />
              ))}
            </div>

            <div className="space-y-6">
              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
                <div className="text-lg font-semibold text-slate-950">Blocked topics</div>
                <div className="mt-1 text-sm text-slate-500">Add or remove topics the assistant should never answer directly.</div>
                <div className="mt-4 flex gap-2">
                  <Input value={newTopic} onChange={(event) => setNewTopic(event.target.value)} placeholder="Add blocked topic" />
                  <Button
                    onClick={async () => {
                      if (!newTopic.trim()) return;
                      await saveGuardrails({ ...data.guardrails, blockedTopics: [...data.guardrails.blockedTopics, newTopic.trim()] });
                      setNewTopic("");
                      toast.success("Blocked topic added.");
                      reload();
                    }}
                  >
                    Add topic
                  </Button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {data.guardrails.blockedTopics.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
                      onClick={async () => {
                        await saveGuardrails({
                          ...data.guardrails,
                          blockedTopics: data.guardrails.blockedTopics.filter((item) => item !== topic),
                        });
                        toast.success("Blocked topic removed.");
                        reload();
                      }}
                    >
                      {topic} ×
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
                <div className="text-lg font-semibold text-slate-950">Prompt injection examples</div>
                <div className="mt-4 space-y-3">
                  {data.guardrails.promptInjectionExamples.map((example) => (
                    <div key={example.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-slate-900">{example.phrase}</div>
                        <StatusBadge value={example.severity} />
                      </div>
                      <div className="mt-2 text-sm text-slate-600">{example.action}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageState>
  );
}

export function SettingsPage() {
  const { data, loading, error, reload } = useControlCenterData();
  const [tab, setTab] = useState<"general" | "apiKeys" | "widgetAppearance" | "rateLimits" | "notifications" | "backupExport">("general");
  const [showKeys, setShowKeys] = useState(false);

  const generalForm = useForm({
    values: data?.settings.general,
  });
  const apiForm = useForm({
    values: data?.settings.apiKeys,
  });
  const widgetForm = useForm({
    values: data?.settings.widgetAppearance,
  });
  const rateLimitForm = useForm({
    values: data?.settings.rateLimits,
  });
  const notificationsForm = useForm({
    values: data?.settings.notifications,
  });

  async function persistSettings(nextSettings: SettingsState) {
    await saveSettings(nextSettings);
    toast.success("Settings saved.");
    reload();
  }

  return (
    <PageState loading={loading} error={error} retry={reload}>
      {data ? (
        <div className="space-y-6">
          <PageHeader
            eyebrow="Admin"
            title="General application settings"
            description="Manage brand identity, secure keys, widget behavior, rate limits, alerts, and backup/export controls."
          />

          <div className="flex flex-wrap gap-2">
            {[
              ["general", "General"],
              ["apiKeys", "API Keys"],
              ["widgetAppearance", "Widget Appearance"],
              ["rateLimits", "Rate Limits"],
              ["notifications", "Notifications"],
              ["backupExport", "Backup & Export"],
            ].map(([key, label]) => (
              <Button key={key} variant={tab === key ? "default" : "outline"} onClick={() => setTab(key as typeof tab)}>
                {label}
              </Button>
            ))}
          </div>

          {tab === "general" ? (
            <form
              className="grid gap-5 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)] md:grid-cols-2"
              onSubmit={generalForm.handleSubmit(async (values) => {
                await persistSettings({ ...data.settings, general: values });
              })}
            >
              <Field label="Brand name">
                <Input {...generalForm.register("brandName")} />
              </Field>
              <Field label="Support email">
                <Input type="email" {...generalForm.register("supportEmail")} />
              </Field>
              <Field label="Website URL">
                <Input {...generalForm.register("websiteUrl")} />
              </Field>
              <Field label="Default language">
                <Select {...generalForm.register("defaultLanguage")}>
                  <option value="English">English</option>
                  <option value="Urdu">Urdu</option>
                  <option value="Roman Urdu">Roman Urdu</option>
                  <option value="Auto">Auto</option>
                </Select>
              </Field>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit">Save</Button>
              </div>
            </form>
          ) : null}

          {tab === "apiKeys" ? (
            <form
              className="space-y-5 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
              onSubmit={apiForm.handleSubmit(async (values) => {
                await persistSettings({ ...data.settings, apiKeys: values });
              })}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500">Keys are masked by default for safer staging and operator reviews.</div>
                <Button variant="outline" type="button" onClick={() => setShowKeys((value) => !value)}>
                  {showKeys ? "Hide keys" : "Show keys"}
                </Button>
              </div>
              <Field label="OpenAI API key">
                <Input type={showKeys ? "text" : "password"} {...apiForm.register("openAiKey")} />
              </Field>
              <Field label="Vector DB key">
                <Input type={showKeys ? "text" : "password"} {...apiForm.register("vectorDbKey")} />
              </Field>
              <Field label="Shopify API key">
                <Input type={showKeys ? "text" : "password"} {...apiForm.register("shopifyApiKey")} />
              </Field>
              <div className="flex justify-end">
                <Button type="submit">Save securely</Button>
              </div>
            </form>
          ) : null}

          {tab === "widgetAppearance" ? (
            <form
              className="grid gap-5 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)] xl:grid-cols-[1.1fr_0.9fr]"
              onSubmit={widgetForm.handleSubmit(async (values) => {
                await persistSettings({ ...data.settings, widgetAppearance: values });
              })}
            >
              <div className="space-y-5">
                <Field label="Chatbot name">
                  <Input {...widgetForm.register("chatbotName")} />
                </Field>
                <Field label="Welcome message">
                  <Textarea {...widgetForm.register("welcomeMessage")} />
                </Field>
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Primary color">
                    <Input type="color" className="h-14 p-2" {...widgetForm.register("primaryColor")} />
                  </Field>
                  <Field label="Position">
                    <Select {...widgetForm.register("position")}>
                      <option value="bottom-right">bottom-right</option>
                      <option value="bottom-left">bottom-left</option>
                    </Select>
                  </Field>
                </div>
                <Controller
                  control={widgetForm.control}
                  name="enableLogo"
                  render={({ field }) => (
                    <ToggleField
                      label="Enable logo"
                      description="Show the Snakitos AI logo in the public widget header."
                      checked={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                <div className="flex justify-end">
                  <Button type="submit">Save</Button>
                </div>
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-slate-50 p-6">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Widget Preview</div>
                <div className="mt-6 max-w-sm rounded-[28px] border border-slate-200 bg-white p-4 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold text-white"
                      // eslint-disable-next-line react-hooks/incompatible-library
                      style={{ backgroundColor: widgetForm.watch("primaryColor") }}
                    >
                      AI
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{widgetForm.watch("chatbotName")}</div>
                      <div className="text-xs text-slate-500">{widgetForm.watch("position")}</div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-3xl bg-slate-50 p-3 text-sm text-slate-600">{widgetForm.watch("welcomeMessage")}</div>
                </div>
              </div>
            </form>
          ) : null}

          {tab === "rateLimits" ? (
            <form
              className="grid gap-5 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)] md:grid-cols-2"
              onSubmit={rateLimitForm.handleSubmit(async (values) => {
                await persistSettings({ ...data.settings, rateLimits: { ...values, requestsPerIp: Number(values.requestsPerIp), requestsPerUser: Number(values.requestsPerUser), cooldownTime: Number(values.cooldownTime) } });
              })}
            >
              <Field label="Requests per IP">
                <Input type="number" {...rateLimitForm.register("requestsPerIp")} />
              </Field>
              <Field label="Requests per user">
                <Input type="number" {...rateLimitForm.register("requestsPerUser")} />
              </Field>
              <Field label="Cooldown time (seconds)">
                <Input type="number" {...rateLimitForm.register("cooldownTime")} />
              </Field>
              <Controller
                control={rateLimitForm.control}
                name="blockAbusiveUsers"
                render={({ field }) => (
                  <ToggleField
                    label="Block abusive users"
                    description="Apply guardrail throttling when repeated abuse patterns are detected."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit">Save</Button>
              </div>
            </form>
          ) : null}

          {tab === "notifications" ? (
            <form
              className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
              onSubmit={notificationsForm.handleSubmit(async (values) => {
                await persistSettings({ ...data.settings, notifications: values });
              })}
            >
              <Controller
                control={notificationsForm.control}
                name="failedAnswers"
                render={({ field }) => (
                  <ToggleField
                    label="Email alert for failed answers"
                    description="Notify the support team when unresolved answers rise."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={notificationsForm.control}
                name="highTokenUsage"
                render={({ field }) => (
                  <ToggleField
                    label="Email alert for high token usage"
                    description="Warn the owner when cost approaches the monthly budget threshold."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={notificationsForm.control}
                name="crawlerFailure"
                render={({ field }) => (
                  <ToggleField
                    label="Email alert for crawler failure"
                    description="Surface failed page fetches before they impact support answers."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={notificationsForm.control}
                name="shopifySyncFailure"
                render={({ field }) => (
                  <ToggleField
                    label="Email alert for Shopify sync failure"
                    description="Get notified when the product sync is stale or partially failed."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <div className="flex justify-end">
                <Button type="submit">Save</Button>
              </div>
            </form>
          ) : null}

          {tab === "backupExport" ? (
            <div className="space-y-5 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Last backup created at {data.settings.backupExport.lastBackupAt}
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {["Export conversations", "Export knowledge base", "Export FAQs", "Export audit logs"].map((label) => (
                  <Button key={label} variant="outline" onClick={() => toast.success(`${label} prepared.`)}>
                    {label}
                  </Button>
                ))}
              </div>
              <Button
                onClick={async () => {
                  await persistSettings({
                    ...data.settings,
                    backupExport: { lastBackupAt: new Date().toISOString().slice(0, 16).replace("T", " ") },
                  });
                }}
              >
                Create backup
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </PageState>
  );
}
