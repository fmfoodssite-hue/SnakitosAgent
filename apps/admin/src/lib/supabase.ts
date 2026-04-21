import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getRecentInteractions() {
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
