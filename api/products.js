import { shopifyService } from "../services/shopify.service";
import { supabaseService } from "../services/supabase.service";
import { ensureAdminSecret } from "../utils/validation.util";
export default async function handler(req, res) {
    if (!ensureAdminSecret(req)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }
    const query = typeof req.query.q === "string"
        ? req.query.q.trim()
        : typeof req.query.title === "string"
            ? req.query.title.trim()
            : "";
    if (!query) {
        res.status(400).json({ error: "Query parameter q is required." });
        return;
    }
    try {
        const products = await shopifyService.searchProducts(query);
        await supabaseService.logEvent("products_api_lookup", {
            query,
            count: products.length,
        });
        res.status(200).json({ products });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unable to fetch products.";
        await supabaseService.logEvent("products_api_error", {
            error: errorMessage,
            query,
        });
        res.status(500).json({ error: errorMessage });
    }
}
