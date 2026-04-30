import { shopifyService } from "../services/shopify.service";
import { supabaseService } from "../services/supabase.service";
import { ensureAdminSecret, extractOrderReference, normalizePhone } from "../utils/validation.util";
export default async function handler(req, res) {
    if (!ensureAdminSecret(req)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }
    const rawOrderId = typeof req.body?.orderId === "string"
        ? req.body.orderId
        : typeof req.body?.message === "string"
            ? extractOrderReference(req.body.message)
            : "";
    const phone = normalizePhone(req.body?.phone);
    if (!rawOrderId || !phone) {
        res.status(400).json({ error: "Both orderId and phone are required." });
        return;
    }
    try {
        const order = await shopifyService.getVerifiedOrder(rawOrderId, phone);
        if (!order) {
            await supabaseService.logEvent("order_verification_failed", {
                orderId: rawOrderId,
                source: "api/orders",
            });
            res.status(404).json({
                verified: false,
                message: "Sorry, we could not verify your order details.\nPlease contact support on WhatsApp: +92-345-828-3827",
            });
            return;
        }
        await supabaseService.logEvent("order_verification_succeeded", {
            orderId: order.orderName,
            source: "api/orders",
        });
        res.status(200).json({
            verified: true,
            order,
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unable to fetch order.";
        await supabaseService.logEvent("orders_api_error", {
            error: errorMessage,
        });
        res.status(500).json({ error: errorMessage });
    }
}
