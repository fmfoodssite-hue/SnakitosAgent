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
              "frame-ancestors 'self' https://*.myshopify.com https://*.shopify.com https://snakitos.com https://www.snakitos.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
