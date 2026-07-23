import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

function normalizeAdminAppUrl(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

const adminAppUrl = normalizeAdminAppUrl(process.env.ADMIN_APP_URL);

const nextConfig: NextConfig = {
  async rewrites() {
    if (!adminAppUrl) {
      return [];
    }

    return [
      {
        source: "/admin",
        destination: adminAppUrl,
      },
      {
        source: "/admin/:path*",
        destination: `${adminAppUrl}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://snakitos-agent.vercel.app/ https://*.myshopify.com https://*.shopify.com https://snakitos.com https://www.snakitos.com;",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
