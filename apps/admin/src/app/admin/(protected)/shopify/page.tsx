import { ShopifyIntegrationPanel } from "@/components/dashboard/shopify-integration-panel";
import { getSyncLogs } from "@/lib/admin/data";

export default async function ShopifyPage() {
  const logs = await getSyncLogs();
  return <ShopifyIntegrationPanel logs={logs} />;
}
