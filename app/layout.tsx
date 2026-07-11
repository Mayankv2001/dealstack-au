import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import { siteUrl } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Site-wide defaults; routes that export their own metadata override these.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "DealStack AU — Stack cashback, gift cards & points",
  description:
    "A deal-stacking research tool for Australian shoppers: combine discount codes, cashback, discounted gift cards and points programmes into one effective price.",
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
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
