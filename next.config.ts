import type { NextConfig } from "next";

// Conservative security set applied to every route, including /admin.
// Deliberately no CSP (Next injects inline scripts; a strict policy needs
// nonce plumbing through the root layout, which is off-limits) and no HSTS
// (Vercel manages HTTPS/HSTS at the platform level).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
