import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { CardOfferForm } from "@/components/admin/CardOfferForm";
import { createCardOffer } from "../actions";
import { todayAU } from "@/lib/offers/expiry";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import { parseCardNumberParam } from "@/lib/admin/cardOfferPrefill";

export const metadata: Metadata = {
  title: "New card offer | DealStack AU admin",
};

function first(value: string | string[] | undefined, max: number): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().slice(0, max);
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

export default async function NewCardOfferPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const provider = first(query.provider, 120);
  const cardName = first(query.card_name, 180);
  const offerSummary = first(query.offer_summary, 500);
  const bonusPoints = parseCardNumberParam(query.bonus_points, 10_000_000);
  const annualFee = parseCardNumberParam(query.annual_fee, 100_000);
  const requestedType = first(query.offer_type, 40);
  const offerType = ["points_bonus", "annual_fee_discount"].includes(requestedType)
    ? requestedType
    : bonusPoints !== null
      ? "points_bonus"
      : "annual_fee_discount";
  const referenceUrl = safeHttpsUrl(first(query.reference_url, 2_000));
  const hasDetectionPrefill = Boolean(provider || cardName || offerSummary);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">New card offer</h1>
        <p className="text-sm text-muted-foreground">
          {hasDetectionPrefill
            ? "Detection-assisted unpublished draft. Verify every field against the issuer before publishing."
            : "Manual entry — no scraping, no external source requests."}
        </p>
        {referenceUrl ? (
          <a
            href={referenceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
          >
            Open detection reference
          </a>
        ) : null}
      </header>

      <CardOfferForm
        action={createCardOffer}
        submitLabel="Create offer"
        defaultValues={{
          provider,
          cardName,
          offerType,
          bonusPoints,
          annualFee,
          offerSummary,
          confidence: "needs-verification",
          reviewByDate: addDays(todayAU(), 30),
          isPublished: false,
        }}
      />
    </div>
  );
}
