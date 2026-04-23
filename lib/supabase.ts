import { supabaseClient, supabaseService } from "../services/supabase.service";

export async function getRecentInteractions(limit = 20) {
  return supabaseService.getRecentLogs(limit);
}

export default supabaseClient;
