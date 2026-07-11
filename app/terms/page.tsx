import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Terms | DealStack AU" };

export default function TermsPage() {
  return (
    <PolicyPage title="Terms of use" updated="11 July 2026">
      <section><h2>Research tool</h2><p>DealStack AU provides general, independently curated information. It is not financial, credit, tax or legal advice and does not assess whether a product is suitable for you.</p></section>
      <section><h2>Verify before acting</h2><p>Rates, availability, eligibility, fees and expiry dates can change. Check the linked retailer, rewards provider or issuer terms before purchasing, transferring points or applying for credit.</p></section>
      <section><h2>Estimates</h2><p>Stack totals and card first-year values are estimates based on displayed assumptions. They may exclude taxes, account fees, redemption restrictions, tracking failures or personal eligibility. A points valuation is an editorial assumption, not a cash guarantee.</p></section>
      <section><h2>External services</h2><p>External links are provided for verification. DealStack AU does not control those services and is not responsible for their availability, security or terms.</p></section>
      <section><h2>Acceptable use</h2><p>Do not attempt to bypass authentication, submit abusive correction reports, interfere with the service, or use automated requests in a way that degrades availability.</p></section>
    </PolicyPage>
  );
}

