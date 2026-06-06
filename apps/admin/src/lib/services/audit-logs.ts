import { assertServiceClient } from "@/lib/db";

export async function listAuditLogs() {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*, admins(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw error;
  }

  return data ?? [];
}

