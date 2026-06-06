import { assertServiceClient } from "@/lib/db";
import type { PromptVersion } from "@/lib/types";

export async function listPromptVersions() {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("prompt_versions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as PromptVersion[];
}

export async function createPromptVersion(values: Omit<PromptVersion, "id" | "created_at">) {
  const supabase = assertServiceClient();

  if (values.is_active) {
    await supabase.from("prompt_versions").update({ is_active: false }).neq("id", "");
  }

  const { data, error } = await supabase
    .from("prompt_versions")
    .insert(values)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as PromptVersion;
}

export async function activatePromptVersion(id: string) {
  const supabase = assertServiceClient();
  await supabase.from("prompt_versions").update({ is_active: false }).neq("id", "");
  const { data, error } = await supabase
    .from("prompt_versions")
    .update({ is_active: true })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as PromptVersion;
}

