import { z } from "zod";
import { withAdminAccess, safeAudit } from "@/lib/server";
import { assertServiceClient } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

const alertSchema = z.object({
  alert_type: z.string().min(2),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  title: z.string().min(3),
  description: z.string().optional().default(""),
  affected_system: z.string().optional().default(""),
  root_cause: z.string().optional().default(""),
  recommended_action: z.string().optional().default(""),
});

export async function GET() {
  return withAdminAccess(["owner", "admin", "support_agent", "content_manager", "viewer"], async () => {
    try {
      const supabase = assertServiceClient();
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return successResponse(data ?? []);
    } catch (error) {
      console.error("Alerts load failed", error);
      return errorResponse("ALERTS_LOAD_FAILED", "Unable to load alerts.", 500);
    }
  });
}

export async function POST(request: Request) {
  return withAdminAccess(["owner", "admin"], async ({ admin, ipAddress }) => {
    try {
      const body = await request.json().catch(() => null);
      const parsed = alertSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse("VALIDATION_FAILED", "Invalid alert payload.", 400, parsed.error.flatten());
      }

      const supabase = assertServiceClient();
      const { data, error } = await supabase
        .from("alerts")
        .insert({ ...parsed.data, status: "open" })
        .select("*")
        .single();

      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "alert.create",
        entityType: "alert",
        entityId: data.id,
        details: { title: parsed.data.title, severity: parsed.data.severity },
        ipAddress,
      });

      return successResponse(data, { status: 201 });
    } catch (error) {
      console.error("Alert create failed", error);
      return errorResponse("ALERT_CREATE_FAILED", "Unable to create alert.", 500);
    }
  });
}

export async function PATCH(request: Request) {
  return withAdminAccess(["owner", "admin"], async ({ admin, ipAddress }) => {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        id?: string;
        status?: string;
      };

      if (!body.id) {
        return errorResponse("VALIDATION_FAILED", "Alert id is required.", 400);
      }

      const supabase = assertServiceClient();
      const { data, error } = await supabase
        .from("alerts")
        .update({
          status: body.status ?? "acknowledged",
          resolved_by: body.status === "resolved" ? admin.id : undefined,
          resolved_at: body.status === "resolved" ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.id)
        .select("*")
        .single();

      if (error) throw error;

      await safeAudit({
        adminId: admin.id,
        action: "alert.update",
        entityType: "alert",
        entityId: body.id,
        details: { status: body.status },
        ipAddress,
      });

      return successResponse(data);
    } catch (error) {
      console.error("Alert update failed", error);
      return errorResponse("ALERT_UPDATE_FAILED", "Unable to update alert.", 500);
    }
  });
}
