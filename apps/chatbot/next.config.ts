import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://*.myshopify.com https://*.shopify.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
