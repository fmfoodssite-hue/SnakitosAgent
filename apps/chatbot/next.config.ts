import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allows webpack to import files from outside the apps/chatbot directory
    // e.g. root-level services/ types/ lib/ folders
    externalDir: true,
  },
};

export default nextConfig;
