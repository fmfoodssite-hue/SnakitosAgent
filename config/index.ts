import dotenv from 'dotenv';
dotenv.config();

export const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  shopify: {
    shopDomain: process.env.SHOPIFY_SHOP_DOMAIN,
    accessToken: process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN,
  },
};

export default config;
