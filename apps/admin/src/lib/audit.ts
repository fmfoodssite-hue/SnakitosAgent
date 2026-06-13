import { assertServiceClient } from "@/lib/db";

type AuditInput = {
  adminId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
};

/**
 * Writes an audit log entry to audit_logs (primary) and mirrors to
 * admin_audit_logs (new production table) in a single transaction attempt.
 * Never throws — failures are silently swallowed to avoid blocking mutations.
 */
export async function writeAuditLog(input: AuditInput) {
  const supabase = assertServiceClient();
  const now = new Date().toISOString();

  // Write to primary legacy table (audit_logs)
  await supabase.from("audit_logs").insert({
    admin_id: input.adminId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    details: input.details ?? {},
    ip_address: input.ipAddress ?? null,
    created_at: now,
  });

  // Mirror to new admin_audit_logs table (fire and forget)
  Promise.resolve(
    supabase.from("admin_audit_logs").insert({
      actor_user_id: input.adminId ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      new_value_json: input.details ?? {},
      ip_address: input.ipAddress ?? null,
      created_at: now,
    }),
  ).catch((err: unknown) => {
    console.warn("admin_audit_logs mirror failed (non-fatal):", (err as Error)?.message ?? err);
  });
}

