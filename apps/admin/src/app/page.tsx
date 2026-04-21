import { 
  ArrowUpRight, 
  Users, 
  ShoppingBag, 
  MessageSquare, 
  TrendingUp,
  Search,
  Plus,
  Clock,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getRecentOrders, getStoreStats } from "@/lib/shopify";
import { getRecentInteractions } from "@/lib/supabase";

export default async function Dashboard() {
  // Fetch real data
  const [orders, interactions, statsData] = await Promise.all([
    getRecentOrders(),
    getRecentInteractions(),
    getStoreStats()
  ]);

  const stats = [
    { 
      label: "Total Orders", 
      value: statsData?.orderCount || "0", 
      change: "+12.5%", 
      icon: ShoppingBag, 
      color: "text-blue-500", 
      bg: "bg-blue-500/10" 
    },
    { 
      label: "Active Customers", 
      value: "8,432", 
      change: "+8.2%", 
      icon: Users, 
      color: "text-purple-500", 
      bg: "bg-purple-500/10" 
    },
    { 
      label: "AI Interactions", 
      value: "42.5k", 
      change: "+24.1%", 
      icon: MessageSquare, 
      color: "text-emerald-500", 
      bg: "bg-emerald-500/10" 
    },
    { 
      label: "Conversion Rate", 
      value: "3.2%", 
      change: "+1.4%", 
      icon: TrendingUp, 
      color: "text-amber-500", 
      bg: "bg-amber-500/10" 
    },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-zinc-400 mt-1">Welcome back, here's what's happening with your agent.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search data..." 
              className="bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-64 transition-all"
            />
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20 active:scale-95">
            <Plus className="w-4 h-4" />
            New Report
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="glass-card p-6 rounded-2xl group hover:border-white/20 transition-all duration-300">
            <div className="flex items-start justify-between">
              <div className={cn("p-3 rounded-xl", stat.bg)}>
                <stat.icon className={cn("w-6 h-6", stat.color)} />
              </div>
              <div className="flex items-center gap-1 text-emerald-500 text-xs font-semibold bg-emerald-500/10 px-2 py-1 rounded-full">
                <ArrowUpRight className="w-3 h-3" />
                {stat.change}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-zinc-400">{stat.label}</p>
              <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Orders from Shopify */}
        <div className="lg:col-span-2 glass-card rounded-3xl p-8 border-white/5">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-semibold">Recent Shopify Orders</h2>
              <p className="text-sm text-zinc-500 mt-1">Latest transactions synced from your store.</p>
            </div>
            <button className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors">View All</button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-zinc-500 text-xs uppercase tracking-wider border-b border-white/5">
                  <th className="pb-4 font-medium">Order</th>
                  <th className="pb-4 font-medium">Customer</th>
                  <th className="pb-4 font-medium">Status</th>
                  <th className="pb-4 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orders.length > 0 ? orders.map((order) => (
                  <tr key={order.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 text-sm font-medium">{order.name}</td>
                    <td className="py-4 text-sm text-zinc-400">
                      {order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : "Guest"}
                    </td>
                    <td className="py-4">
                      <span className={cn(
                        "text-[10px] px-2 py-1 rounded-full font-bold uppercase",
                        order.financial_status === "paid" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                      )}>
                        {order.financial_status}
                      </span>
                    </td>
                    <td className="py-4 text-sm font-bold text-right">${order.total_price}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-zinc-500 text-sm">
                      <div className="flex flex-col items-center gap-2">
                        <ShoppingBag className="w-8 h-8 opacity-20" />
                        <p>No orders found. Check your Shopify API keys.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live AI Activity from Supabase */}
        <div className="glass-card rounded-3xl p-8 border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Live AI Activity</h2>
            <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1 rounded-full">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-500 uppercase">Live</span>
            </div>
          </div>
          
          <div className="space-y-6">
            {interactions.length > 0 ? interactions.map((item: any, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0 text-indigo-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200">User Query</p>
                  <p className="text-xs text-zinc-500 truncate mt-0.5">"{item.query || "Asked a question..."}"</p>
                  <div className="flex items-center gap-2 mt-2">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span className="text-[10px] text-zinc-500">AI Responded</span>
                  </div>
                </div>
              </div>
            )) : (
              <div className="py-12 text-center text-zinc-500 text-sm">
                <BotIcon className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p>Waiting for interactions...</p>
              </div>
            )}
          </div>
          
          <button className="w-full mt-8 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium transition-all text-zinc-300 flex items-center justify-center gap-2">
            <Clock className="w-4 h-4" />
            View History
          </button>
        </div>
      </div>
    </div>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  );
}
