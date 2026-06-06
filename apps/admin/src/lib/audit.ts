import { assertServiceClient } from "@/lib/db";

type AuditInput = {
  adminId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
};

export async function writeAuditLog(input: AuditInput) {
  const supabase = assertServiceClient();
  await supabase.from("audit_logs").insert({
    admin_id: input.adminId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    details: input.details ?? {},
    ip_address: input.ipAddress ?? null,
  });
}

