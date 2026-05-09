"use client";

import {
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsSnapshot } from "@/lib/admin/types";

const pieColors = ["#38bdf8", "#818cf8", "#f59e0b", "#34d399", "#fb7185"];

export function AnalyticsDashboard({ analytics }: { analytics: AnalyticsSnapshot }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricMini label="Total users" value={String(analytics.behavior.totalUsers)} />
        <MetricMini label="Returning users" value={String(analytics.behavior.returningUsers)} />
        <MetricMini label="Session duration" value={`${Math.round(analytics.behavior.averageSessionDurationSec)} sec`} />
        <MetricMini label="Queries / session" value={String(analytics.behavior.queriesPerSession)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top intents breakdown</CardTitle>
            <CardDescription>Volume split across product, order, and general intents.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={analytics.query.intents} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110}>
                  {analytics.query.intents.map((entry, index) => (
                    <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI confidence distribution</CardTitle>
            <CardDescription>Track how often the model is operating with high retrieval confidence.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.ai.confidenceBuckets}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="bucket" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="value" fill="#38bdf8" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <CardTitle>Chats and chatbot-attributed sales over time</CardTitle>
            <CardDescription>Daily usage volume paired with orders initiated via the chatbot.</CardDescription>
          </CardHeader>
          <CardContent className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.dailyVolume}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="chats" stroke="#38bdf8" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="sales" stroke="#f59e0b" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversion metrics</CardTitle>
            <CardDescription>Commerce actions influenced by the chatbot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <MetricMini label="Product clicks" value={String(analytics.conversion.productClicks)} compact />
            <MetricMini label="Add to cart" value={String(analytics.conversion.addToCart)} compact />
            <MetricMini label="Orders initiated" value={String(analytics.conversion.ordersInitiated)} compact />
            <Button className="w-full" variant="secondary" asChild>
              <a href="/api/admin/analytics/export">Export CSV</a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Most asked questions</CardTitle>
            <CardDescription>Use this list to improve retrieval coverage and merchandising copy.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.query.topQuestions.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <span className="text-sm text-slate-200">{item.label}</span>
                <span className="text-sm font-semibold text-white">{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top failed queries and categories</CardTitle>
            <CardDescription>Where the assistant still struggles most.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              {analytics.topFailedQueries.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <span className="text-sm text-slate-200">{item.label}</span>
                  <span className="text-sm font-semibold text-rose-200">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.failureCategories} layout="vertical">
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" width={90} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#fb7185" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Peak usage hours</CardTitle>
          <CardDescription>Spot the best windows for campaigns and support staffing.</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.hourlyUsage}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="hour" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip />
              <Bar dataKey="chats" fill="#818cf8" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricMini({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/[0.03] ${compact ? "p-4" : "p-5"}`}>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}
