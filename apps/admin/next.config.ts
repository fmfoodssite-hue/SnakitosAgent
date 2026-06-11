import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/admin",
  env: {
    NEXT_PUBLIC_ADMIN_BASE_PATH: "/admin",
  },
};

export default nextConfig;
