import { assertServiceClient } from "@/lib/db";

export async function listSettings() {
  const supabase = assertServiceClient();
  const { data, error } = await supabase.from("settings").select("*").order("key");
  if (error) {
    throw error;
  }

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
    .upsert({
      key: input.key,
      value: input.value,
      description: input.description,
      updated_by: input.updated_by,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

