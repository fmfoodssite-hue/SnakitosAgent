import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allows importing files from outside the apps/chatbot directory (e.g., the root lib folder)
    externalDir: true,
  },
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
