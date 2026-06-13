import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdminAccess(["owner", "admin", "viewer"], async () => {
    try {
      const { searchParams } = new URL(request.url);
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const limit = Math.min(200, parseInt(searchParams.get("limit") ?? "50", 10));
      const offset = (page - 1) * limit;
      const action = searchParams.get("action");
      const entityType = searchParams.get("entity_type");

      const supabase = assertServiceClient();
      let query = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (action) query = query.ilike("action", `%${action}%`);
      if (entityType) query = query.eq("entity_type", entityType);

      const { data, error, count } = await query;
      if (error) throw error;

      return successResponse({
        logs: data ?? [],
        total: count ?? 0,
        page,
        limit,
      });
    } catch (error) {
      console.error("Audit logs load failed", error);
      return errorResponse("AUDIT_LOGS_FAILED", "Unable to load audit logs.", 500);
    }
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin"], async ({ admin, ipAddress }) => {
    try {
      const body = (await request.json().catch(() => ({}))) as { action?: string };

      if (body.action !== "export") {
        return errorResponse("VALIDATION_FAILED", "Supported action is export.", 400);
      }

      const supabase = assertServiceClient();
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5000);

      await safeAudit({
        adminId: admin.id,
        action: "audit_logs.export",
        entityType: "audit_logs",
        ipAddress,
      });

      // Return as CSV-ready JSON for frontend to download
      return successResponse({
        rows: data ?? [],
        exported_at: new Date().toISOString(),
        exported_by: admin.email,
      });
    } catch (error) {
      console.error("Audit log export failed", error);
      return errorResponse("AUDIT_LOG_EXPORT_FAILED", "Unable to export audit logs.", 500);
    }
  });
}
