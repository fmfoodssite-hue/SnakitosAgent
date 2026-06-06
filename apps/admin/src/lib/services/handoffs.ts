import { assertServiceClient } from "@/lib/db";
import type { HandoffTicket } from "@/lib/types";

export async function listHandoffs() {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("handoff_tickets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as HandoffTicket[];
}

export async function createHandoff(values: Omit<HandoffTicket, "id" | "ticket_number" | "created_at" | "updated_at">) {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("handoff_tickets")
    .insert(values)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as HandoffTicket;
}

export async function updateHandoff(id: string, values: Partial<HandoffTicket>) {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("handoff_tickets")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as HandoffTicket;
}

