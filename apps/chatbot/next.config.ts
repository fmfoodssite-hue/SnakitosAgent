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

function getFrameAncestors(): string {
  const defaults = [
    "'self'",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://*.myshopify.com",
    "https://*.shopify.com",
    "https://snakitos.com",
    "https://www.snakitos.com",
  ];
  const configured = (process.env.CHATBOT_FRAME_ANCESTORS ?? "")
    .split(/[,\s]+/)
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  return Array.from(new Set([...defaults, ...configured])).join(" ");
}

const adminAppUrl = normalizeAdminAppUrl(process.env.ADMIN_APP_URL);
const frameAncestors = getFrameAncestors();

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
            value: `frame-ancestors ${frameAncestors};`,
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
