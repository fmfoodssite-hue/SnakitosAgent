import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, hasSupabaseServiceEnv } from "@/lib/env";

let serviceClient: SupabaseClient | null = null;

export function getSupabaseServiceClient() {
  if (!hasSupabaseServiceEnv()) {
    return null;
  }

  if (!serviceClient) {
    serviceClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return serviceClient;
}
