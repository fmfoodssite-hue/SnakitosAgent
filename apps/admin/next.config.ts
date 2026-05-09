import type { NextConfig } from "next";

const basePath = "/apps/admin";

const nextConfig: NextConfig = {
  basePath,
  env: {
    NEXT_PUBLIC_ADMIN_BASE_PATH: basePath,
  },
};

export default nextConfig;
