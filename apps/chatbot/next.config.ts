import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    // Allows importing files from outside the apps/chatbot directory (e.g., the root lib folder)
    externalDir: true,
  },
};

export default nextConfig;
