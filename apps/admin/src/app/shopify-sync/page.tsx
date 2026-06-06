import { AdminPage } from "@/components/dashboard/AdminPage";
import { DataCard } from "@/components/dashboard/DataCard";
import { PageIntro } from "@/components/dashboard/PageIntro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePageAccess } from "@/lib/page-auth";
import { listShopifyProducts } from "@/lib/services/shopify";

export default async function ShopifySyncPage() {
  await requirePageAccess(["owner", "admin", "content_manager", "viewer"]);
  const products = (await listShopifyProducts()) as Array<{
    id: string;
    title: string;
    product_url?: string | null;
    collection?: string | null;
    stock_status?: string | null;
    last_synced_at?: string | null;
  }>;

  return (
    <AdminPage>
      <PageIntro eyebrow="Shopify Sync" title="Backend-only commerce sync" description="Sync products through secure admin routes only. Prices, stock hints, tags, variants, and URLs are stored server-side for RAG and analytics." />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <DataCard title="Sync Controls" description="Trigger from `/api/admin/shopify/sync` with or without a target collection.">
          <div className="flex flex-wrap gap-3">
            <Button>Sync All Products</Button>
            <Button variant="outline">Sync Selected Collection</Button>
            <Button variant="secondary">Reindex Products Into RAG</Button>
          </div>
        </DataCard>
        <DataCard title="Sync Summary">
          <div className="space-y-3 text-sm text-zinc-300">
            <div className="flex items-center justify-between"><span>Synced products</span><strong>{products.length}</strong></div>
            <div className="flex items-center justify-between"><span>Latest sync</span><strong>{products[0]?.last_synced_at ? new Date(products[0].last_synced_at).toLocaleString() : "Never"}</strong></div>
          </div>
        </DataCard>
      </div>
      <DataCard title="Synced Products">
        <div className="space-y-3">
          {products.map((product) => (
            <div key={product.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{product.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">{product.product_url}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{product.collection ?? "No collection"}</Badge>
                  <Badge tone={product.stock_status === "in_stock" ? "success" : product.stock_status === "out_of_stock" ? "warning" : "default"}>{product.stock_status ?? "unknown"}</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DataCard>
    </AdminPage>
  );
}
