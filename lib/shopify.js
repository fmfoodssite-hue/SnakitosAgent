import * as crypto from "crypto";
import { shopifyService } from "../services/shopify.service";
export function verifyShopifyProxy(params, secret) {
    const { hmac, signature, ...rest } = params;
    const providedHmac = Array.isArray(hmac) ? hmac[0] : hmac;
    const providedSignature = Array.isArray(signature) ? signature[0] : signature;
    const digest = providedHmac || providedSignature;
    if (!digest) {
        return false;
    }
    const serialized = Object.keys(rest)
        .sort()
        .map((key) => {
        const value = rest[key];
        return `${key}=${Array.isArray(value) ? value.join(",") : value}`;
    })
        .join("");
    const calculated = crypto.createHmac("sha256", secret).update(serialized).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(digest));
}
export async function getOrderStatus(orderId) {
    return shopifyService.findOrder(orderId);
}
export async function getProductInfo(query) {
    const products = await shopifyService.searchProducts(query);
    return products[0] ?? null;
}
export async function getRecentOrders(limit = 5) {
    return shopifyService.getRecentOrders(limit);
}
export async function getStoreStats() {
    return shopifyService.getStoreStats();
}
export default shopifyService;
