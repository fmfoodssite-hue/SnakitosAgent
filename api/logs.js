import { supabaseService } from "../services/supabase.service";
import { ensureAdminSecret } from "../utils/validation.util";
export default async function handler(req, res) {
    if (!ensureAdminSecret(req)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (req.method === "GET") {
        const limit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 50;
        const logs = await supabaseService.getRecentLogs(Number.isFinite(limit) ? limit : 50);
        res.status(200).json({ logs });
        return;
    }
    if (req.method === "POST") {
        const event = typeof req.body?.event === "string" ? req.body.event.trim() : "";
        if (!event) {
            res.status(400).json({ error: "Event is required." });
            return;
        }
        await supabaseService.logEvent(event, req.body?.metadata ?? {});
        res.status(200).json({ success: true });
        return;
    }
    res.status(405).json({ error: "Method not allowed" });
}
