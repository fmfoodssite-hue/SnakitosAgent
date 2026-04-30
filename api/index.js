import { config, hasRequiredRuntimeConfig } from "../config";
export default function handler(req, res) {
    res.status(200).json({
        service: "snakitos-support-agent",
        ok: true,
        environmentReady: hasRequiredRuntimeConfig(),
        adminDomain: config.shopify.adminDomain,
        storefrontDomain: config.shopify.storefrontDomain,
        timestamp: new Date().toISOString(),
    });
}
