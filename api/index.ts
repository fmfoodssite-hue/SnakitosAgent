import { VercelRequest, VercelResponse } from "@vercel/node";
import { config, hasRequiredRuntimeConfig } from "../config";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  res.status(200).json({
    service: "snakitos-support-agent",
    ok: true,
    environmentReady: hasRequiredRuntimeConfig(),
    adminDomain: config.shopify.adminDomain,
    storefrontDomain: config.shopify.storefrontDomain,
    timestamp: new Date().toISOString(),
  });
}
