import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Coins,
  Layers,
  ShieldCheck,
  Store as StoreIcon,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import SiteFooter from "@/components/SiteFooter";
import { getGiftCardOffers, getStores } from "@/lib/repos";
import type { GiftCardOffer } from "@/lib/offers/types";
import { formatDateAU } from "@/lib/sources/normalise";
import {
  compatibilityStatusLabel,
  evaluateGiftCardCompatibility,
  type GiftCardCompatibilityStatus,
} from "@/lib/giftcards/compatibility";
import { offerEffectiveSaving } from "@/lib/giftcards/publicQuery";
import { acquisitionForSpend, valuePointsOffer } from "@/lib/giftcards/value";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

/**
 * Public gift-card offer detail — server component. Reads ONLY approved,
 * published, live offers (getGiftCardOffers is RLS is_published + expiry-guarded),
 * so a missing / unpublished / expired id resolves to notFound(). Every figure
 * comes from the shared valuation (lib/giftcards/value.ts) and the structured
 * compatibility model; points are always disclosed as an estimate, never cash.
 */

export const revalidate = 300;

const round1 = (n: number) => Math.round(n * 10) / 10;

const PROMO_LABEL: Record<NonNullable<GiftCardOffer["promotionType"]>, string> = {
  discount: "Discount",
  "bonus-value": "Bonus value",
  points: "Points",
  membership: "Membership offer",
};

async function findOffer(id: string): Promise<GiftCardOffer | undefined> {
  const offers = await getGiftCardOffers();
  return offers.find((o) => o.id === id);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const offer = await findOffer(id);
  return offer
    ? {
        title: `${offer.brand} gift card offer | DealStack AU`,
        description: `Reviewed ${offer.brand} gift-card promotion — value, terms, accepted retailers and stacking compatibility.`,
      }
    : { title: "Gift card offer not found | DealStack AU" };
}

const STATUS_STYLE: Record<
  GiftCardCompatibilityStatus,
  { icon: typeof CheckCircle2; className: string }
> = {
  compatible: { icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  "likely-compatible": { icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  "requires-verification": { icon: CircleAlert, className: "text-amber-600 dark:text-amber-400" },
  "insufficient-evidence": { icon: CircleHelp, className: "text-muted-foreground" },
  incompatible: { icon: XCircle, className: "text-destructive" },
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === false) return null;
  return (
    <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-b-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium sm:max-w-[60%] sm:text-right">{value}</dd>
    </div>
  );
}

export default async function GiftCardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [offer, stores] = await Promise.all([findOffer(id), getStores()]);
  if (!offer) notFound(); // missing, unpublished, or expired

  const now = new Date();
  const compat = evaluateGiftCardCompatibility(offer, { now });
  const statusStyle = STATUS_STYLE[compat.status];
  const StatusIcon = statusStyle.icon;

  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const acceptedMerchants = offer.acceptedAtMerchantIds
    .map((mid) => storeName.get(mid) ?? mid)
    .concat(offer.acceptedAt ?? []);
  const buildStackMerchant = offer.acceptedAtMerchantIds[0] ?? null;

  const effectivePct = offerEffectiveSaving(offer);
  const program = offer.pointsProgram ?? offer.pointsOnPurchase?.program ?? null;
  const pointsValuation =
    offer.pointsMultiplier && program
      ? valuePointsOffer(offer.pointsMultiplier, 100, program, offer.pointsValueCents)
      : null;
  // Per-$100 economics from the shared acquisition maths.
  const acquisition =
    effectivePct != null ? acquisitionForSpend(100, effectivePct) : null;
  const involvesPoints =
    (offer.pointsMultiplier ?? 0) > 0 ||
    offer.pointsOnPurchase != null ||
    offer.promotionType === "points";
  const involvesBonus =
    (offer.bonusPercent ?? 0) > 0 || offer.promotionType === "bonus-value";
  const detailUrl = offer.sourceDetailUrl ? safeHttpsUrl(offer.sourceDetailUrl) : null;

  return (
    <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]">
      <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <Button asChild variant="ghost" size="sm">
            <Link href="/gift-cards">
              <ArrowLeft />
              All gift cards
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="flex flex-col gap-3 border-b pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            >
              {PROMO_LABEL[offer.promotionType ?? "discount"]}
            </Badge>
            {offer.sourceName ? (
              <span className="text-xs text-muted-foreground">via {offer.sourceName}</span>
            ) : null}
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {offer.brand}{" "}
            <span className="text-muted-foreground">gift card offer</span>
          </h1>
          {effectivePct != null ? (
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {offer.discountPercent > 0 && !involvesBonus && !involvesPoints
                ? `${round1(offer.discountPercent)}% off face value`
                : `≈${round1(effectivePct)}% effective saving`}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            {buildStackMerchant ? (
              <Button asChild size="sm">
                <Link href={`/?stack=${encodeURIComponent(buildStackMerchant)}#calculator`}>
                  <Layers />
                  Build a stack with this card
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href="/deals">
                  <Layers />
                  Explore deal stacks
                </Link>
              </Button>
            )}
            {detailUrl ? (
              <Button asChild size="sm" variant="outline">
                <a href={detailUrl} target="_blank" rel="nofollow noopener noreferrer">
                  Offer source
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        {/* Compatibility */}
        <section className="mt-6 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <StatusIcon aria-hidden className={`mt-0.5 size-5 shrink-0 ${statusStyle.className}`} />
            <div>
              <p className="flex items-center gap-2 font-semibold">
                <ShieldCheck aria-hidden className="size-4 text-muted-foreground" />
                Stacking compatibility: {compatibilityStatusLabel(compat.status)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{compat.reason}</p>
              {compat.warnings.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {compat.warnings.map((w) => (
                    <li key={w} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <CircleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* Offer facts */}
          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="mb-1 font-semibold">Offer details</h2>
            <dl>
              <Row label="Gift-card brand" value={offer.brand} />
              <Row label="Seller / where to buy" value={offer.purchaseLocation ?? offer.source} />
              <Row label="Promotion type" value={PROMO_LABEL[offer.promotionType ?? "discount"]} />
              <Row
                label="Value"
                value={
                  involvesBonus && offer.bonusPercent
                    ? `${round1(offer.bonusPercent)}% bonus value`
                    : involvesPoints && offer.pointsMultiplier && program
                      ? `${round1(offer.pointsMultiplier)}× ${program}`
                      : offer.discountPercent > 0
                        ? `${round1(offer.discountPercent)}% off`
                        : null
                }
              />
              <Row label="Starts" value={offer.startDate ? formatDateAU(offer.startDate) : null} />
              <Row
                label="Expires"
                value={offer.expiryDate ? formatDateAU(offer.expiryDate) : "No end date listed"}
              />
              <Row label="Denominations" value={offer.denominationNote} />
              <Row
                label="Spend cap"
                value={offer.capDollars != null ? `First $${offer.capDollars} of value per order` : null}
              />
              <Row label="Minimum spend" value={offer.minSpend != null ? `$${offer.minSpend}` : null} />
              <Row label="Per-customer limit" value={offer.limitPerCustomer} />
              <Row label="Membership required" value={offer.membershipRequired ? "Yes" : null} />
              <Row label="Activation required" value={offer.activationRequired ? "Yes" : null} />
              <Row label="Promo code required" value={offer.couponRequired ? "Yes" : null} />
              <Row label="Format" value={offer.format && offer.format !== "unknown" ? offer.format : null} />
            </dl>
          </section>

          {/* Economics */}
          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="mb-1 flex items-center gap-2 font-semibold">
              <Coins aria-hidden className="size-4 text-muted-foreground" />
              What it&apos;s worth
            </h2>
            <dl>
              <Row
                label="Effective saving"
                value={effectivePct != null ? `≈${round1(effectivePct)}%` : "Not quantifiable"}
              />
              {acquisition && acquisition.saving > 0 ? (
                <>
                  <Row
                    label="Per $100 of value"
                    value={`Pay ≈$${round1(acquisition.cashPaid)} (save ≈$${round1(acquisition.saving)})`}
                  />
                  <Row
                    label="Effective economic cost"
                    value={`≈$${round1(acquisition.cashPaid)} for $100 of gift-card value`}
                  />
                </>
              ) : null}
              {pointsValuation ? (
                <>
                  <Row
                    label="Points valuation"
                    value={`${offer.pointsMultiplier}× on a $100 card ≈ ${pointsValuation.points.toLocaleString()} points ≈ $${round1(pointsValuation.valueDollars)} at ${pointsValuation.pointValueCents}c/point`}
                  />
                  <Row
                    label="Effective economic cost"
                    value={`≈$${round1(pointsValuation.effectiveCostDollars)} net for a $100 card`}
                  />
                </>
              ) : null}
            </dl>
            {involvesPoints || involvesBonus ? (
              <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                <strong>Points are not cash.</strong> Reward and bonus values are
                estimates at our published rate, shown separately from the cash you
                pay. Actual value depends on how you redeem — never treat points as
                guaranteed money.
              </p>
            ) : null}
          </section>
        </div>

        {/* Acceptance + notes */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              <StoreIcon aria-hidden className="size-4 text-muted-foreground" />
              Where you can spend it
            </h2>
            {acceptedMerchants.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {[...new Set(acceptedMerchants)].map((m) => (
                  <li
                    key={m}
                    className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Acceptance not listed — check the retailer before buying.
              </p>
            )}
          </section>

          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="mb-2 font-semibold">How to use &amp; stack</h2>
            {(offer.usageNotes?.length ?? 0) > 0 || (offer.stackNotes?.length ?? 0) > 0 ? (
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {(offer.usageNotes ?? []).map((n) => (
                  <li key={`u-${n}`} className="flex gap-1.5">
                    <span aria-hidden className="text-emerald-600">•</span>
                    {n}
                  </li>
                ))}
                {(offer.stackNotes ?? []).map((n) => (
                  <li key={`s-${n}`} className="flex gap-1.5">
                    <Layers aria-hidden className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                    {n}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No extra usage notes recorded.</p>
            )}
          </section>
        </div>

        {/* Attribution */}
        <section className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card p-4 text-xs text-muted-foreground shadow-sm">
          <span className="flex items-center gap-1.5">
            <CalendarClock aria-hidden className="size-3.5" />
            Last checked {formatDateAU(offer.lastCheckedAt.slice(0, 10))}
            {offer.sourceName ? ` · source: ${offer.sourceName}` : ` · source: ${offer.source}`}
          </span>
          <span>Reviewed by a person before publication. Always confirm current terms.</span>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
