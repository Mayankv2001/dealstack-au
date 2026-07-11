import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Privacy | DealStack AU" };

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy" updated="11 July 2026">
      <section><h2>What the public site collects</h2><p>DealStack AU does not require a public account and does not collect names, email addresses or payment details. Search terms remain in the page URL and are processed to return results.</p></section>
      <section><h2>Analytics and diagnostics</h2><p>We use Vercel Web Analytics to understand aggregate page usage without advertising profiles. Browser and server failures may create limited diagnostic records containing the route path, error type, truncated technical details and browser user-agent. Authentication tokens, URL query strings, form contents and secret values are excluded.</p></section>
      <section><h2>Cookies</h2><p>Public browsing does not require an application cookie. The private admin area uses Supabase authentication cookies to maintain an authorised administrator session.</p></section>
      <section><h2>Correction reports</h2><p>If you report an incorrect offer, we store the selected reason, your message, the affected offer and submission time. We do not request contact details. A short-lived one-way request fingerprint is used only to enforce abuse limits.</p></section>
      <section><h2>Service providers and retention</h2><p>Hosting and operational logs are provided by Vercel; application data is stored in Supabase. Diagnostic and rate-limit records are retained only as long as operationally necessary. Offer audit records are retained to preserve editorial accountability.</p></section>
    </PolicyPage>
  );
}

