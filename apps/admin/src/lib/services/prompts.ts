import { assertServiceClient } from "@/lib/db";
import type { PromptVersion } from "@/lib/types";

export async function listPromptVersions() {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("prompt_versions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PromptVersion[];
}

export async function getActivePromptVersion(): Promise<PromptVersion | null> {
  const supabase = assertServiceClient();
  const { data } = await supabase
    .from("prompt_versions")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as PromptVersion | null;
}

export async function createPromptVersion(
  values: Omit<PromptVersion, "id" | "created_at"> & { created_by?: string | null },
) {
  const supabase = assertServiceClient();

  // New prompt versions start as draft — do NOT auto-activate
  const insertValues = {
    ...values,
    is_active: false,
    status: "draft" as const,
  };

  const { data, error } = await supabase
    .from("prompt_versions")
    .insert(insertValues)
    .select("*")
    .single();

  if (error) throw error;
  return data as PromptVersion;
}

export async function approvePromptVersion(id: string, approvedBy: string) {
  const supabase = assertServiceClient();

  // Fetch current to ensure it's in draft state
  const { data: current } = await supabase
    .from("prompt_versions")
    .select("status, is_active")
    .eq("id", id)
    .maybeSingle();

  if (!current) throw new Error("Prompt version not found.");
  if (current.is_active) throw new Error("Cannot approve an already-active prompt.");

  const { data, error } = await supabase
    .from("prompt_versions")
    .update({
      status: "approved",
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as PromptVersion;
}

export async function publishPromptVersion(id: string, publishedBy: string) {
  const supabase = assertServiceClient();

  const { data: current } = await supabase
    .from("prompt_versions")
    .select("status, is_active")
    .eq("id", id)
    .maybeSingle();

  if (!current) throw new Error("Prompt version not found.");
  if (current.is_active) throw new Error("Prompt version is already active/published.");
  if (current.status === "draft") {
    throw new Error("Prompt must be approved before publishing. Approve it first.");
  }

  // Deactivate all current prompts
  await supabase
    .from("prompt_versions")
    .update({ is_active: false, status: "archived", updated_at: new Date().toISOString() })
    .eq("is_active", true);

  const { data, error } = await supabase
    .from("prompt_versions")
    .update({
      is_active: true,
      status: "published",
      published_by: publishedBy,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as PromptVersion;
}

export async function rollbackPromptVersion(rollbackToId: string, triggeredBy: string) {
  const supabase = assertServiceClient();

  const { data: target } = await supabase
    .from("prompt_versions")
    .select("*")
    .eq("id", rollbackToId)
    .maybeSingle();

  if (!target) throw new Error("Target prompt version not found.");

  // Deactivate current active
  await supabase
    .from("prompt_versions")
    .update({ is_active: false, status: "archived", updated_at: new Date().toISOString() })
    .eq("is_active", true);

  // Activate target
  const { data, error } = await supabase
    .from("prompt_versions")
    .update({
      is_active: true,
      status: "published",
      published_by: triggeredBy,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rollbackToId)
    .select("*")
    .single();

  if (error) throw error;
  return data as PromptVersion;
}

export async function activatePromptVersion(id: string) {
  const supabase = assertServiceClient();
  await supabase
    .from("prompt_versions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .neq("id", id);
  const { data, error } = await supabase
    .from("prompt_versions")
    .update({ is_active: true, status: "published", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as PromptVersion;
}
