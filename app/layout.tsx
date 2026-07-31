import type { Metadata } from "next";
import { connection } from "next/server";
import { siteUrl } from "@/lib/env";
import "./globals.css";

// Site-wide defaults; routes that export their own metadata override these.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "DealStack AU — Plan a purchase and combine savings",
  description:
    "An Australian purchase-planning tool that keeps checkout savings, later cashback and points separate while checking compatibility.",
  openGraph: {
    siteName: "DealStack AU",
    locale: "en_AU",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce-based CSP requires request-time rendering so Next can attach the
  // proxy-generated nonce to framework scripts.
  await connection();
  // Fonts are self-hosted woff2 declared in globals.css (@font-face): CSP is
  // font-src 'self', so next/font's CDN loaders are deliberately not used and
  // no font CSS variable is set here.
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
