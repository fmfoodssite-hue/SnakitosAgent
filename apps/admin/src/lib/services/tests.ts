import { assertServiceClient } from "@/lib/db";

export async function listTestCases() {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("rag_test_cases")
    .select("*, rag_test_runs(*)")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createTestCase(input: Record<string, unknown>) {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("rag_test_cases")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createTestRun(input: Record<string, unknown>) {
  const supabase = assertServiceClient();
  const { data, error } = await supabase
    .from("rag_test_runs")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

