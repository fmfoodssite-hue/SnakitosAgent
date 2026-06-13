import { assertServiceClient } from "@/lib/db";

export async function listSettings() {
  const supabase = assertServiceClient();
  const { data, error } = await supabase.from("settings").select("*").order("key");
  if (error) throw error;
  return data ?? [];
}

export async function upsertSetting(input: {
  key: string;
  value: Record<string, unknown>;
  description?: string;
  updated_by?: string;
}) {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("settings")
    .upsert(
      {
        key: input.key,
        // Support both column names during migration (value_json is production, value is legacy)
        value_json: input.value,
        description: input.description ?? null,
        created_by: input.updated_by ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
