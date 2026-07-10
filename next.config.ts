import type { NextConfig } from "next";

// Conservative security set applied to every route, including /admin.
// Deliberately no enforced CSP (Next injects inline scripts; a strict policy
// needs nonce plumbing through the root layout, which is off-limits) and no
// HSTS (Vercel manages HTTPS/HSTS at the platform level).
//
// The candidate CSP below ships REPORT-ONLY: browsers log violations to the
// console without blocking anything, so it maps out exactly what an enforced
// policy would need before we commit to one. 'unsafe-inline' for scripts and
// styles is the known Next.js floor until nonces are plumbed; everything else
// is 'self' because Supabase is only reached server-side, fonts are
// self-hosted by next/font, and images are local. Dev additionally needs
// 'unsafe-eval' + websockets for HMR.
const isDev = process.env.NODE_ENV === "development";
const cspReportOnly = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
