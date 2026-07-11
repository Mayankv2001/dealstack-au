import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Editorial policy | DealStack AU" };

export default function EditorialPolicyPage() {
  return (
    <PolicyPage title="Editorial policy" updated="11 July 2026">
      <section><h2>How offers are selected</h2><p>Public offers are manually reviewed. Feed items and detected changes enter private staging queues and cannot publish automatically. Inclusion is based on usefulness, source quality, freshness and whether the terms can be represented accurately.</p></section>
      <section><h2>Source standards</h2><p>Card offers require an issuer HTTPS source, confirmed figures and a future review deadline. Other offers must link to an appropriate retailer, programme, provider or approved community source. Unsafe links and placeholder content are hidden.</p></section>
      <section><h2>Freshness</h2><p>An issuer expiry date is recorded only when the issuer states one. Ongoing offers use a separate mandatory review-by date and are hidden automatically when that deadline passes. Expired or unverified content is not kept public merely to fill a category.</p></section>
      <section><h2>Commercial independence</h2><p>DealStack AU currently receives no commission for the card offers it lists. Any future affiliate or sponsored relationship must be disclosed beside the relevant content and must not bypass the same verification rules.</p></section>
      <section><h2>Corrections and history</h2><p>Readers can report potentially incorrect card offers for administrative review. Reports never alter public content automatically. Material verified card changes are summarised publicly; the internal audit log retains the authorised administrative record.</p></section>
    </PolicyPage>
  );
}

