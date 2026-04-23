import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function saveInteraction(userId: string, query: string, response: string) {
  try {
    const { error } = await supabase
      .from("interactions")
      .insert([
        { 
          user_id: userId, 
          query: query, 
          response: response,
          created_at: new Date().toISOString()
        }
      ]);

    if (error) throw error;
  } catch (error) {
    console.error("Failed to save interaction:", error);
  }
}
