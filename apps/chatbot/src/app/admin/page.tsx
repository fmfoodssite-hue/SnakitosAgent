import React from 'react';

// This is a mock for the data fetching logic
// In a real app, you would fetch from your /api/logs route or directly from Supabase
async function getLogs() {
  // const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/logs`, { cache: 'no-store' });
  // return res.json();
  
  // Mock data for demonstration
  return [
    { id: 1, user_id: 'cust_99', message: 'Where is my order #123?', response: 'Your order is in transit...', created_at: '2026-04-21T10:00:00Z' },
    { id: 2, user_id: 'cust_102', message: 'Do you have red shoes?', response: 'Yes, we have several models in red.', created_at: '2026-04-21T09:45:00Z' },
  ];
}

export default async function AdminDashboard() {
  const logs = await getLogs();

  return (
    <main className="min-h-screen bg-[#0f172a] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              Agent Control Center
            </h1>
            <p className="text-slate-400 mt-1">Real-time monitoring and tracking</p>
          </div>
          <div className="flex gap-4">
            <div className="px-4 py-2 bg-slate-800 rounded-lg border border-slate-700">
              <span className="text-xs text-slate-500 block uppercase">Status</span>
              <span className="text-green-400 font-medium">● Operational</span>
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          {[
            { label: 'Total Conversations', value: '4,290', color: 'text-blue-400' },
            { label: 'Avg Response Time', value: '1.2s', color: 'text-emerald-400' },
            { label: 'AI Success Rate', value: '98%', color: 'text-purple-400' },
            { label: 'Shopify Sync', value: 'Active', color: 'text-orange-400' },
          ].map((stat, i) => (
            <div key={i} className="bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-700/50">
              <span className="text-slate-500 text-sm font-medium">{stat.label}</span>
              <div className={`text-2xl font-bold mt-2 ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Tracking Table */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="p-6 border-b border-slate-700/50">
            <h2 className="text-xl font-semibold">Live Chat Tracking</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900/50 text-slate-400 text-sm">
                  <th className="p-4 font-medium">Time</th>
                  <th className="p-4 font-medium">User</th>
                  <th className="p-4 font-medium">Query</th>
                  <th className="p-4 font-medium">Agent Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="p-4 text-slate-400 text-sm whitespace-nowrap">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-xs">
                        {log.user_id}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-300 max-w-xs truncate">
                      {log.message}
                    </td>
                    <td className="p-4 text-sm text-slate-500 italic max-w-xs truncate">
                      {log.response}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
