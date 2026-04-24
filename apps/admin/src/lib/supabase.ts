import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = getSupabaseClient();

export async function getRecentInteractions() {
  if (!supabase) {
    console.warn("Supabase environment variables are missing for the admin app.");
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("interactions") // Assuming the table is named 'interactions'
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Supabase Error:", error);
    return [];
  }
}
