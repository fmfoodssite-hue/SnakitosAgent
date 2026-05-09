"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SyncLogRecord } from "@/lib/admin/types";

export function ShopifyIntegrationPanel({ logs }: { logs: SyncLogRecord[] }) {
  const [loading, setLoading] = useState<string | null>(null);

  const sync = async (resource: "products" | "orders" | "customers") => {
    setLoading(resource);
    const response = await fetch("/api/admin/shopify/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource }),
    });
    const payload = await response.json();
    setLoading(null);
    toast[response.ok ? "success" : "error"](payload.message ?? "Sync completed");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <CardHeader>
          <CardTitle>Shopify credentials</CardTitle>
          <CardDescription>Manage domain and access token for store synchronization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder="Store domain" defaultValue={process.env.NEXT_PUBLIC_SHOPIFY_DOMAIN ?? "snakitos.myshopify.com"} />
          <Input placeholder="Admin API token" defaultValue="••••••••••••••••" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Button disabled={loading === "products"} onClick={() => sync("products")}>
              Sync products
            </Button>
            <Button variant="secondary" disabled={loading === "orders"} onClick={() => sync("orders")}>
              Sync orders
            </Button>
            <Button variant="outline" disabled={loading === "customers"} onClick={() => sync("customers")}>
              Sync customers
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync and webhook logs</CardTitle>
          <CardDescription>See latest sync activity, failures, and webhook health in one place.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Last sync</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="capitalize">{log.syncType}</TableCell>
                  <TableCell className="capitalize">{log.status}</TableCell>
                  <TableCell>{log.recordsProcessed}</TableCell>
                  <TableCell>{new Date(log.startedAt).toLocaleString()}</TableCell>
                  <TableCell className="text-slate-400">{log.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
