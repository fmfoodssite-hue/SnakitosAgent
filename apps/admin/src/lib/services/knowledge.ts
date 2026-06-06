import { assertServiceClient } from "@/lib/db";
import type { KnowledgeDocument } from "@/lib/types";

export async function listKnowledgeDocuments() {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as KnowledgeDocument[];
}

export async function createKnowledgeDocument(
  values: Omit<KnowledgeDocument, "id" | "created_at" | "updated_at">,
) {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .insert(values)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as KnowledgeDocument;
}

export async function updateKnowledgeDocument(
  id: string,
  values: Partial<Omit<KnowledgeDocument, "id" | "created_at" | "updated_at">>,
) {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as KnowledgeDocument;
}

export async function deleteKnowledgeDocument(id: string) {
  const supabase = assertServiceClient();
  const { error } = await supabase.from("knowledge_documents").delete().eq("id", id);
  if (error) {
    throw error;
  }
}

