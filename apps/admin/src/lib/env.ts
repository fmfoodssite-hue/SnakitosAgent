export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  shopifyDomain: process.env.SHOPIFY_ADMIN_DOMAIN ?? process.env.SHOPIFY_SHOP_DOMAIN ?? "",
  shopifyToken: process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN ?? "",
  pineconeApiKey: process.env.PINECONE_API_KEY ?? "",
  pineconeIndexName: process.env.PINECONE_INDEX ?? "",
  pineconeNamespace: process.env.PINECONE_NAMESPACE ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_ADMIN_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
};

export function hasSupabaseEnv() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function hasSupabaseServiceEnv() {
  return hasSupabaseEnv() && Boolean(env.supabaseServiceRoleKey);
}
