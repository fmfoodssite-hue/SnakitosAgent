import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Search,
  Settings,
  ShoppingBag,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { shopifyService } from "@/server/services/shopify.service";
import { supabaseService } from "@/server/services/supabase.service";

type AuditRow = {
  id: string;
  userId: string;
  chatId: string;
  query: string;
  response: string;
  createdAt: string;
  responseTimeMs: number;
  status: string;
};

export const dynamic = "force-dynamic";

async function getAuditRows(): Promise<AuditRow[]> {
  try {
    const logs = await supabaseService.getRecentLogs(120);

    return logs
      .filter((row) => String(row.event ?? "") === "chat_processed")
      .map((row, index) => {
        const metadata =
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};

        return {
          id: String(row.id ?? `log-${index}`),
          userId: String(metadata.userId ?? "unknown-user"),
          chatId: String(metadata.chatId ?? "unknown-session"),
          query: String(metadata.userMessage ?? metadata.query ?? "No query captured"),
          response: String(metadata.response ?? "No response captured"),
          createdAt: String(row.created_at ?? new Date().toISOString()),
          responseTimeMs: Number(metadata.responseTimeMs ?? 0),
          status: String(metadata.status ?? "success"),
        } satisfies AuditRow;
      })
      .filter((row) => row.query || row.response);
  } catch {
    return [];
  }
}

function formatDuration(ms: number): string {
  if (!ms) return "0ms";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatOrderAmount(amount: string, currencyCode: string): string {
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value)) {
    return amount || "0";
  }

  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: currencyCode || "PKR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function AdminDashboard() {
  const [orders, rows, statsData] = await Promise.all([
    shopifyService.getRecentOrders(8).catch(() => []),
    getAuditRows(),
    shopifyService.getStoreStats().catch(() => ({} as Record<string, number>)),
  ]);

  const sessionCount = new Set(rows.map((row) => row.chatId)).size;
  const avgResponseMs = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.responseTimeMs, 0) / rows.length)
    : 0;
  const successRate = rows.length
    ? Math.round((rows.filter((row) => row.status === "success").length / rows.length) * 100)
    : 0;

  const stats = [
    {
      label: "Total Orders",
      value: `${statsData.orderCount ?? orders.length ?? 0}`,
      change: orders.length > 0 ? `${orders.length} recent` : "Awaiting sync",
      icon: ShoppingBag,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Active Customers",
      value: `${sessionCount}`,
      change: rows.length > 0 ? "Live sessions" : "No active chats",
      icon: Users,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      label: "AI Interactions",
      value: `${rows.length}`,
      change: rows.length > 0 ? `${successRate}% success` : "Awaiting chats",
      icon: MessageSquare,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Avg Response Time",
      value: formatDuration(avgResponseMs),
      change: rows.length > 0 ? "From live audit" : "No data yet",
      icon: TrendingUp,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/admin", active: true },
    { icon: ShoppingBag, label: "Orders", href: "/admin" },
    { icon: Users, label: "Customers", href: "/admin" },
    { icon: Bot, label: "AI Training", href: "/admin" },
    { icon: MessageSquare, label: "Interactions", href: "/admin" },
    { icon: Settings, label: "Settings", href: "/admin" },
  ];

  return (
    <div className="flex min-h-screen w-full bg-[#09090b] text-zinc-100">
      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-white/5 bg-[#09090b] md:flex">
        <div className="p-6">
          <div className="flex items-center gap-3 px-2">
            <div className="bg-gradient-premium flex h-8 w-8 items-center justify-center rounded-lg">
              <Zap className="h-5 w-5 fill-current text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">Agent Admin</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-4 py-4">
          {menuItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`group flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                item.active
                  ? "bg-white/5 text-white"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <item.icon
                className={`h-5 w-5 transition-transform duration-200 group-hover:scale-110 ${
                  item.active ? "text-indigo-400" : "text-zinc-500"
                }`}
              />
              <span className="font-medium">{item.label}</span>
              {item.active ? (
                <div className="ml-auto h-5 w-1 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
              ) : null}
            </a>
          ))}
        </nav>

        <div className="mt-auto space-y-2 p-4">
          <a
            href="/admin/login"
            className="group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-zinc-400 transition-all duration-200 hover:bg-red-500/5 hover:text-red-400"
          >
            <LogOut className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
            <span className="font-medium">Logout</span>
          </a>

          <div className="glass-card rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-indigo-400">Status</p>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <p className="text-sm font-medium text-zinc-300">AI Agent Online</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="relative min-h-screen flex-1">
        <div className="pointer-events-none absolute left-0 top-0 h-full w-full bg-[radial-gradient(circle_at_30%_20%,#1e1b4b_0%,transparent_50%)] opacity-20" />

        <header className="sticky top-0 z-30 border-b border-white/5 bg-[#09090b]/90 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-premium flex h-9 w-9 items-center justify-center rounded-xl">
                <Zap className="h-5 w-5 fill-current text-white" />
              </div>
              <span className="text-sm font-semibold tracking-tight text-white">Agent Admin</span>
            </div>
          </div>
        </header>

        <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
          <div className="space-y-10">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
                <p className="mt-1 text-zinc-400">Welcome back, here&apos;s what&apos;s happening with your agent.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search data..."
                    className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <a
                  href="/admin/login"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-all shadow-lg shadow-indigo-500/20 active:scale-95 hover:bg-indigo-500 sm:w-auto"
                >
                  <Zap className="h-4 w-4" />
                  Admin Access
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="glass-card group rounded-2xl p-6 transition-all duration-300 hover:border-white/20"
                >
                  <div className="flex items-start justify-between">
                    <div className={`${stat.bg} rounded-xl p-3`}>
                      <stat.icon className={`${stat.color} h-6 w-6`} />
                    </div>
                    <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-500">
                      <ArrowUpRight className="h-3 w-3" />
                      {stat.change}
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-sm font-medium text-zinc-400">{stat.label}</p>
                    <h3 className="mt-1 text-2xl font-bold">{stat.value}</h3>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <div className="glass-card rounded-3xl border-white/5 p-5 sm:p-6 lg:col-span-2 lg:p-8">
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Recent Shopify Orders</h2>
                    <p className="mt-1 text-sm text-zinc-500">Latest transactions synced from your store.</p>
                  </div>
                  <a
                    className="text-left text-xs font-medium text-indigo-400 transition-colors hover:text-indigo-300 sm:text-right"
                    href="/admin"
                  >
                    View All
                  </a>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left">
                    <thead>
                      <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-zinc-500">
                        <th className="pb-4 font-medium">Order</th>
                        <th className="pb-4 font-medium">Customer</th>
                        <th className="pb-4 font-medium">Status</th>
                        <th className="pb-4 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {orders.length > 0 ? (
                        orders.map((order) => (
                          <tr key={order.id} className="group transition-colors hover:bg-white/[0.02]">
                            <td className="py-4 text-sm font-medium">{order.orderName}</td>
                            <td className="py-4 text-sm text-zinc-400">{order.customerName ?? "Guest"}</td>
                            <td className="py-4">
                              <span
                                className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                                  order.financialStatus.toLowerCase() === "paid"
                                    ? "bg-emerald-500/10 text-emerald-500"
                                    : "bg-amber-500/10 text-amber-500"
                                }`}
                              >
                                {order.financialStatus}
                              </span>
                            </td>
                            <td className="py-4 text-right text-sm font-bold">
                              {formatOrderAmount(order.totalAmount, order.currencyCode)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-12 text-center text-sm text-zinc-500">
                            <div className="flex flex-col items-center gap-2">
                              <ShoppingBag className="h-8 w-8 opacity-20" />
                              <p>No orders found. Check your Shopify API keys.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="glass-card rounded-3xl border-white/5 p-5 sm:p-6 lg:p-8">
                <div className="mb-6 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">Live AI Activity</h2>
                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1">
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-bold uppercase text-emerald-500">Live</span>
                  </div>
                </div>

                <div className="space-y-5">
                  {rows.length > 0 ? (
                    rows.slice(0, 5).map((item) => (
                      <div key={item.id} className="flex items-start gap-3 sm:gap-4">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
                          <MessageSquare className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-zinc-200">User Query</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">"{item.query || "Asked a question..."}"</p>
                          <div className="mt-2 flex items-center gap-2">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            <span className="text-[10px] text-zinc-500">
                              {item.status === "success" ? "AI Responded" : "Needs review"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-sm text-zinc-500">
                      <Bot className="mx-auto mb-2 h-8 w-8 opacity-20" />
                      <p>Waiting for interactions...</p>
                    </div>
                  )}
                </div>

                <a
                  href="/admin/login"
                  className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 py-3 text-sm font-medium text-zinc-300 transition-all hover:bg-white/10"
                >
                  <Clock className="h-4 w-4" />
                  View History
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
