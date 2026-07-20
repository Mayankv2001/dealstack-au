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
  ExternalLink,
  Layers,
  ListOrdered,
  ScrollText,
  ShieldCheck,
  Store as StoreIcon,
  Ticket,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import GiftCardAcceptance from "@/components/GiftCardAcceptance";
import GiftCardDenominationExamples from "@/components/GiftCardDenominationExamples";
import GiftCardWorkedExample from "@/components/GiftCardWorkedExample";
import ReportProblemForm from "@/components/ReportProblemForm";
import {
  getCurrentReviewedGiftCardOffers,
  getGiftCardAcceptance,
  getGiftCardProducts,
  getStores,
} from "@/lib/repos";
import type { GiftCardOffer } from "@/lib/offers/types";
import { formatDateAU } from "@/lib/sources/normalise";
import {
  compatibilityStatusLabel,
  type GiftCardCompatibilityStatus,
} from "@/lib/giftcards/compatibility";
import { offerEffectiveSaving } from "@/lib/giftcards/publicQuery";
import { buildClaimSteps } from "@/lib/giftcards/claimSteps";
import { buildTermsRows, formatExpiry } from "@/lib/giftcards/termsRows";
import {
  analyseGiftCardStackability,
  summariseGiftCardStackability,
  type StageAnalysis,
} from "@/lib/giftcards/stackability";
import { buildProductAcceptance } from "@/lib/giftcards/acceptanceModel";
import { buildOfferWorkedExampleRows } from "@/lib/giftcards/offerWorkedExamples";
import { giftCardDateState } from "@/lib/giftcards/dateState";
import { safePublicSourceUrl } from "@/lib/security/urlPolicy";

/**
 * Public gift-card offer detail — server component. Reads ONLY approved,
 * published, live offers (RLS is_published + expiry guard) plus the
 * admin-activated product/acceptance rows; a missing / unpublished / expired
 * id resolves to notFound(). Every section renders STRUCTURED fields through
 * the pure lib/giftcards models — no source article prose ever reaches this
 * page, and points/bonus estimates are always disclosed separately from cash.
 */

export const revalidate = 300;

const round1 = (n: number) => Math.round(n * 10) / 10;

const PROMO_LABEL: Record<
  NonNullable<GiftCardOffer["promotionType"]>,
  string
> = {
  discount: "Discount",
  "fixed-dollar-discount": "Fixed-dollar discount",
  "bonus-value": "Bonus value",
  points: "Points",
  "promo-credit": "Seller promo credit",
  "fee-waiver": "Purchase-fee waiver",
  membership: "Membership offer",
  mixed: "Compound campaign",
};

const STATUS_STYLE: Record<
  GiftCardCompatibilityStatus,
  { icon: typeof CheckCircle2; className: string }
> = {
  compatible: {
    icon: CheckCircle2,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  "likely-compatible": {
    icon: CheckCircle2,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  "requires-verification": {
    icon: CircleAlert,
    className: "text-amber-600 dark:text-amber-400",
  },
  "insufficient-evidence": {
    icon: CircleHelp,
    className: "text-muted-foreground",
  },
  incompatible: { icon: XCircle, className: "text-destructive" },
};

const FACT_TONE: Record<string, string> = {
  positive: "text-emerald-700 dark:text-emerald-400",
  caution: "text-amber-700 dark:text-amber-400",
  negative: "text-destructive",
  neutral: "text-muted-foreground",
};

async function findOffer(id: string): Promise<GiftCardOffer | undefined> {
  // Display boundary: an unknown-expiry reviewed offer must resolve here —
  // the carousel and grid link to it — while expired/future rows still 404.
  const offers = await getCurrentReviewedGiftCardOffers();
  return offers.find((o) => o.id === id);
}

/** Original DealStack headline built from structured fields only. */
function offerTitle(offer: GiftCardOffer): string {
  const seller = offer.purchaseLocation ?? offer.source;
  if (offer.promotionType === "promo-credit") {
    return `$${round1(offer.promoCreditDollars ?? 0)} seller promo credit on ${offer.brand} gift cards at ${seller}`;
  }
  if (offer.promotionType === "fixed-dollar-discount") {
    return `$${round1(offer.fixedDiscountDollars ?? 0)} off ${offer.brand} gift cards at ${seller}`;
  }
  if (offer.promotionType === "fee-waiver") {
    return `Purchase fee waived on ${offer.brand} gift cards at ${seller}`;
  }
  if (offer.discountPercent > 0) {
    return `${round1(offer.discountPercent)}% off ${offer.brand} gift cards at ${seller}`;
  }
  if ((offer.bonusPercent ?? 0) > 0) {
    return `${round1(offer.bonusPercent!)}% bonus value on ${offer.brand} gift cards at ${seller}`;
  }
  const program = offer.pointsProgram ?? offer.pointsOnPurchase?.program;
  if ((offer.pointsMultiplier ?? 0) > 0 && program) {
    return `${round1(offer.pointsMultiplier!)}× ${program} points on ${offer.brand} gift cards at ${seller}`;
  }
  if ((offer.fixedPoints ?? 0) > 0 && program) {
    return `${offer.fixedPoints!.toLocaleString("en-AU")} ${program} points on ${offer.brand} gift cards at ${seller}`;
  }
  return `${offer.brand} gift card offer at ${seller}`;
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
        title: `${offerTitle(offer)} | DealStack AU`,
        description: `Reviewed ${offer.brand} gift-card promotion — how to claim, where the card works, exact terms and stacking compatibility.`,
      }
    : { title: "Gift card offer not found | DealStack AU" };
}

function SectionCard({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon: typeof Layers;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatusHeading({ analysis }: { analysis: StageAnalysis }) {
  const style = STATUS_STYLE[analysis.status];
  const Icon = style.icon;
  return (
    <p className="flex items-start gap-2">
      <Icon
        aria-hidden
        className={`mt-0.5 size-4 shrink-0 ${style.className}`}
      />
      <span className="text-sm">
        <span className="font-semibold">
          {compatibilityStatusLabel(analysis.status)}.
        </span>{" "}
        <span className="text-muted-foreground">{analysis.reason}</span>
      </span>
    </p>
  );
}

function StagePanel({
  heading,
  analysis,
}: {
  heading: string;
  analysis: StageAnalysis;
}) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <h3 className="text-sm font-semibold">{heading}</h3>
      <div className="mt-2">
        <StatusHeading analysis={analysis} />
      </div>
      <dl className="mt-2">
        {analysis.facts.map((fact) => (
          <div
            key={`${fact.label}-${fact.value}`}
            className="flex flex-col gap-0.5 border-b py-2 text-sm last:border-b-0 sm:flex-row sm:justify-between sm:gap-4"
          >
            <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
            <dd className={`sm:text-right ${FACT_TONE[fact.tone]}`}>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
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

  const productIds = [
    ...new Set(
      [offer.productId, ...(offer.includedProductIds ?? [])].filter(
        (pid): pid is string => Boolean(pid),
      ),
    ),
  ];
  const [products, acceptance] = await Promise.all([
    getGiftCardProducts(productIds),
    getGiftCardAcceptance(productIds),
  ]);

  const now = new Date();
  const stackability = analyseGiftCardStackability(offer, { now, acceptance });
  const compat = summariseGiftCardStackability(stackability);
  const compatStyle = STATUS_STYLE[compat.status];
  const CompatIcon = compatStyle.icon;
  const stackWarnings = [
    ...new Set([
      ...stackability.acquisition.warnings,
      ...stackability.redemption.warnings,
    ]),
  ].filter((warning) => !compat.warnings.includes(warning));
  const claimSteps = buildClaimSteps(offer);
  const termsRows = buildTermsRows(offer);
  const productViews = buildProductAcceptance(offer, products, acceptance, now);
  const denominationRows = buildOfferWorkedExampleRows(offer, products);
  // Display boundary keeps upcoming-soon offers resolvable; they must read as
  // upcoming everywhere, never as active.
  const isUpcoming = giftCardDateState(offer, now) === "future";

  const storeNames: Record<string, string> = Object.fromEntries(
    stores.map((s) => [s.id, s.name]),
  );
  const offerLevelMerchants = [
    ...new Set([
      ...offer.acceptedAtMerchantIds.map((mid) => storeNames[mid] ?? mid),
      ...(offer.acceptedAt ?? []),
    ]),
  ];
  const buildStackMerchant = offer.acceptedAtMerchantIds[0] ?? null;

  const effectivePct = offerEffectiveSaving(offer);
  const seller = offer.purchaseLocation ?? offer.source;
  const detailUrl = offer.sourceDetailUrl
    ? safePublicSourceUrl(offer.sourceDetailUrl)
    : null;
  const involvesPoints =
    (offer.pointsMultiplier ?? 0) > 0 ||
    (offer.fixedPoints ?? 0) > 0 ||
    offer.pointsOnPurchase != null ||
    offer.promotionType === "points";
  const issuers = [
    ...new Set(
      products
        .map((product) => product.issuer?.trim())
        .filter((issuer): issuer is string => Boolean(issuer)),
    ),
  ];
  const corroboratingSources = [
    ...new Set(
      offer.citations
        .map((citation) => citation.source?.trim())
        .filter(
          (source): source is string =>
            Boolean(source) &&
            source.toLowerCase() !==
              (offer.sourceName ?? offer.source).toLowerCase(),
        ),
    ),
  ];

  const overviewRows: Array<{ label: string; value: React.ReactNode }> = [
    { label: "Buy from", value: seller },
    { label: "Discovered via", value: offer.sourceName ?? offer.source },
    ...(corroboratingSources.length
      ? [{ label: "Corroborated by", value: corroboratingSources.join(", ") }]
      : []),
    { label: "Card family", value: offer.brand },
    ...(issuers.length
      ? [{ label: "Issuer", value: issuers.join(", ") }]
      : []),
    {
      label: "Redeem at",
      value: offerLevelMerchants.length
        ? offerLevelMerchants.join(", ")
        : "See acceptance conditions",
    },
    {
      label: "Promotion type",
      value: PROMO_LABEL[offer.promotionType ?? "discount"],
    },
    {
      label: "Saving",
      value:
        offer.promotionType === "promo-credit"
          ? `$${round1(offer.promoCreditDollars ?? 0)} future seller credit`
          : offer.promotionType === "fee-waiver"
            ? offer.feeWaiverDollars
              ? `$${round1(offer.feeWaiverDollars)} purchase fee waived`
              : "Purchase fee waived"
            : // A points award is a real, stated benefit even when we hold no
              // cents-per-point valuation — state the facts, never
              // "Not quantifiable" for a quantified reward.
              (offer.fixedPoints ?? 0) > 0
              ? `${offer.fixedPoints!.toLocaleString("en-AU")} ${offer.pointsProgram ?? "loyalty"} points per eligible card${effectivePct != null ? ` (≈${round1(effectivePct)}% effective on $100)` : ""}`
              : (offer.pointsMultiplier ?? 0) > 0
                ? `${round1(offer.pointsMultiplier!)}× ${offer.pointsProgram ?? "loyalty"} points${effectivePct != null ? ` (≈${round1(effectivePct)}% effective)` : ""}`
                : effectivePct != null
                  ? offer.discountPercent > 0
                    ? `${round1(offer.discountPercent)}% off face value`
                    : `≈${round1(effectivePct)}% effective`
                  : "Not quantifiable",
    },
    {
      label: "Starts",
      value: offer.startDate ? formatDateAU(offer.startDate) : "Not recorded",
    },
    {
      label: "Expires",
      value:
        formatExpiry(offer) ??
        (offer.isOngoing
          ? "Ongoing"
          : "Expiry not recorded — verify at source"),
    },
    { label: "Checked", value: formatDateAU(offer.lastCheckedAt.slice(0, 10)) },
    { label: "Reviewed by", value: "DealStack" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <Link
          href="/gift-cards"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All gift cards
        </Link>
        <div className="gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          {/* ── Main column ─────────────────────────────────────────────── */}
          <div className="min-w-0 space-y-6">
            {/* 1 · Offer overview */}
            <div className="flex flex-col gap-3 border-b pb-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                >
                  {PROMO_LABEL[offer.promotionType ?? "discount"]}
                </Badge>
                {isUpcoming && offer.startDate ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  >
                    Upcoming — starts {formatDateAU(offer.startDate)}
                  </Badge>
                ) : null}
                <ConfidenceBadge confidence={offer.confidence} />
              </div>
              {isUpcoming && offer.startDate ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  This promotion has not started. Nothing can be claimed before{" "}
                  {formatDateAU(offer.startDate)} — the details below describe
                  what the offer will be.
                </p>
              ) : null}
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {offerTitle(offer)}
              </h1>
              {effectivePct != null &&
              offer.promotionType !== "promo-credit" ? (
                <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  {offer.discountPercent > 0
                    ? `${round1(offer.discountPercent)}% off face value`
                    : `≈${round1(effectivePct)}% effective saving`}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                {buildStackMerchant ? (
                  <Button asChild size="sm">
                    <Link
                      href={`/?stack=${encodeURIComponent(buildStackMerchant)}#calculator`}
                    >
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
                    <a
                      href={detailUrl}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                    >
                      Offer source
                    </a>
                  </Button>
                ) : null}
              </div>
              <ReportProblemForm
                entityType="gift-card-offer"
                entityId={offer.id}
              />
            </div>

            {/* Compatibility verdict */}
            <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-start gap-3">
                <CompatIcon
                  aria-hidden
                  className={`mt-0.5 size-5 shrink-0 ${compatStyle.className}`}
                />
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <ShieldCheck
                      aria-hidden
                      className="size-4 text-muted-foreground"
                    />
                    Stacking compatibility:{" "}
                    {compatibilityStatusLabel(compat.status)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {compat.reason}
                  </p>
                  {compat.warnings.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {compat.warnings.map((w) => (
                        <li
                          key={w}
                          className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
                        >
                          <CircleAlert
                            aria-hidden
                            className="mt-0.5 size-3 shrink-0"
                          />
                          {w}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </section>

            {/* 2 · How to claim */}
            <SectionCard
              id="how-to-claim"
              title="How to claim"
              icon={ListOrdered}
            >
              <ol className="space-y-2.5">
                {claimSteps.map((step, index) => (
                  <li key={step.text} className="flex gap-3 text-sm">
                    <span
                      aria-hidden
                      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                    >
                      {index + 1}
                    </span>
                    <span>
                      {step.text}
                      {step.note ? (
                        <span className="block text-xs text-muted-foreground">
                          {step.note}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                Steps are generated from the reviewed offer terms — anything not
                listed here wasn&apos;t recorded, so check the source page.
              </p>
            </SectionCard>

            {/* 3 · Included gift cards */}
            <SectionCard
              id="included-cards"
              title="Included gift cards"
              icon={Ticket}
            >
              {productViews.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {productViews.map((view) => (
                    <li key={view.productId}>
                      <a
                        href={`#product-${view.productId}`}
                        className="inline-block rounded-full border bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
                      >
                        {view.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <ul className="flex flex-wrap gap-1.5">
                    <li className="rounded-full border bg-background px-3 py-1 text-xs font-medium">
                      {offer.brand}
                    </li>
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Individual product records for this promotion haven&apos;t
                    been published yet — the brand above is taken from the
                    reviewed offer.
                  </p>
                </>
              )}
            </SectionCard>

            {/* 4 · Where each card works */}
            <SectionCard
              id="acceptance"
              title="Where each card works"
              icon={StoreIcon}
            >
              {offerLevelMerchants.length > 0 ? (
                <div className="mb-3">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Retailers listed on the reviewed offer
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {offerLevelMerchants.map((m) => (
                      <li
                        key={m}
                        className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                      >
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {productViews.length > 0 ? (
                <GiftCardAcceptance
                  views={productViews}
                  storeNames={storeNames}
                  nowIso={now.toISOString()}
                />
              ) : offerLevelMerchants.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Acceptance not listed — check the retailer before buying.
                </p>
              ) : null}
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Acceptance depends on the merchant category code assigned to the
                transaction. Verify before purchase.
              </p>
            </SectionCard>

            {/* 5 · Stackability analysis */}
            <SectionCard
              id="stackability"
              title="Stackability analysis"
              icon={Layers}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <StagePanel
                  heading="Buying the card (acquisition)"
                  analysis={stackability.acquisition}
                />
                <StagePanel
                  heading="Spending the card (redemption)"
                  analysis={stackability.redemption}
                />
              </div>
              {stackWarnings.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {stackWarnings.map((w) => (
                    <li
                      key={w}
                      className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
                    >
                      <CircleAlert
                        aria-hidden
                        className="mt-0.5 size-3 shrink-0"
                      />
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}
            </SectionCard>

            {/* 6 · Worked example */}
            <SectionCard
              id="worked-example"
              title="Worked example"
              icon={Coins}
            >
              {denominationRows.length > 0 ? (
                <div className="mb-4 border-b pb-4">
                  <GiftCardDenominationExamples rows={denominationRows} />
                </div>
              ) : null}
              <GiftCardWorkedExample
                stackSearchQuery={`${offer.brand} ${seller}`}
                inputs={{
                  promotionType: offer.promotionType ?? "discount",
                  discountPercent: offer.discountPercent || null,
                  bonusPercent: offer.bonusPercent ?? null,
                  pointsMultiplier: offer.pointsMultiplier ?? null,
                  fixedPoints: offer.fixedPoints ?? null,
                  pointsProgram:
                    offer.pointsProgram ??
                    offer.pointsOnPurchase?.program ??
                    null,
                  pointsValueCents: offer.pointsValueCents ?? null,
                  fixedDiscountDollars: offer.fixedDiscountDollars ?? null,
                  promoCreditDollars: offer.promoCreditDollars ?? null,
                  feeWaiverDollars: offer.feeWaiverDollars ?? null,
                  thresholdDollars: offer.thresholdDollars ?? null,
                  capDollars: offer.capDollars,
                }}
              />
            </SectionCard>

            {/* 7 · Terms and limits */}
            <SectionCard id="terms" title="Terms and limits" icon={ScrollText}>
              <dl>
                {termsRows.map((row) => (
                  <div
                    key={row.key}
                    className="flex flex-col gap-0.5 border-b py-2.5 text-sm last:border-b-0 sm:flex-row sm:justify-between sm:gap-4"
                  >
                    <dt className="shrink-0 text-muted-foreground">
                      {row.label}
                    </dt>
                    <dd className="font-medium sm:max-w-[65%] sm:text-right">
                      {row.value == null ? (
                        <span className="font-normal text-amber-700 dark:text-amber-400">
                          Not recorded — check the source before buying
                        </span>
                      ) : row.href ? (
                        <a
                          href={row.href}
                          target="_blank"
                          rel="nofollow noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {row.value}
                          <ExternalLink aria-hidden className="size-3" />
                        </a>
                      ) : (
                        row.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              {(offer.usageNotes?.length ?? 0) > 0 ||
              (offer.stackNotes?.length ?? 0) > 0 ? (
                <div className="mt-3 border-t pt-3">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Reviewer notes
                  </p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {(offer.usageNotes ?? []).map((n) => (
                      <li key={`u-${n}`} className="flex gap-1.5">
                        <span aria-hidden className="text-emerald-600">
                          •
                        </span>
                        {n}
                      </li>
                    ))}
                    {(offer.stackNotes ?? []).map((n) => (
                      <li key={`s-${n}`} className="flex gap-1.5">
                        <Layers
                          aria-hidden
                          className="mt-0.5 size-3 shrink-0 text-emerald-600"
                        />
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </SectionCard>

            {/* 8 · Source and trust */}
            <SectionCard
              id="source"
              title="Source and trust"
              icon={ShieldCheck}
            >
              <dl>
                <div className="flex flex-col gap-0.5 border-b py-2.5 text-sm sm:flex-row sm:justify-between">
                  <dt className="text-muted-foreground">Original source</dt>
                  <dd className="font-medium">
                    {detailUrl ? (
                      <a
                        href={detailUrl}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {offer.sourceName ?? offer.source}
                        <ExternalLink aria-hidden className="size-3" />
                      </a>
                    ) : (
                      (offer.sourceName ?? offer.source)
                    )}
                  </dd>
                </div>
                {offer.termsUrl ? (
                  <div className="flex flex-col gap-0.5 border-b py-2.5 text-sm sm:flex-row sm:justify-between">
                    <dt className="text-muted-foreground">
                      Seller / issuer terms
                    </dt>
                    <dd className="font-medium">
                      <a
                        href={offer.termsUrl}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Official terms and conditions
                        <ExternalLink aria-hidden className="size-3" />
                      </a>
                    </dd>
                  </div>
                ) : null}
                <div className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:justify-between">
                  <dt className="text-muted-foreground">
                    Checked by DealStack
                  </dt>
                  <dd className="font-medium">
                    {formatDateAU(offer.lastCheckedAt.slice(0, 10))}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                DealStack AU is independent and not affiliated with the seller,
                issuer or source above. Details are reviewed by a person before
                publication, but promotions change without notice —{" "}
                <strong>verify the current terms before purchasing.</strong>
              </p>
            </SectionCard>
          </div>

          {/* ── Sticky summary (desktop) ────────────────────────────────── */}
          <aside className="mt-6 lg:sticky lg:top-20 lg:mt-0">
            <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <h2 className="mb-1 font-semibold">At a glance</h2>
              <dl>
                {overviewRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex flex-col gap-0.5 border-b py-2 text-sm last:border-b-0 sm:flex-row sm:justify-between sm:gap-3"
                  >
                    <dt className="shrink-0 text-muted-foreground">
                      {row.label}
                    </dt>
                    <dd className="font-medium sm:text-right">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex items-start gap-2 rounded-lg border bg-background px-3 py-2">
                <CompatIcon
                  aria-hidden
                  className={`mt-0.5 size-4 shrink-0 ${compatStyle.className}`}
                />
                <p className="text-xs">
                  <span className="text-muted-foreground">Stacking:</span>{" "}
                  <span className="font-semibold">
                    {compatibilityStatusLabel(compat.status)}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    — see the full analysis.
                  </span>
                </p>
              </div>
              {offer.promoCode ? (
                <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-sm">
                  Promo code:{" "}
                  <code className="font-semibold">{offer.promoCode}</code>
                </p>
              ) : null}
              {involvesPoints ? (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Points values shown are estimates at our published rate — not
                  cash.
                </p>
              ) : null}
            </div>
          </aside>
        </div>

        {/* Attribution strip */}
        <section className="mt-8 flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card p-4 text-xs text-muted-foreground shadow-sm">
          <span className="flex items-center gap-1.5">
            <CalendarClock aria-hidden className="size-3.5" />
            Last checked {formatDateAU(offer.lastCheckedAt.slice(0, 10))}
            {offer.sourceName
              ? ` · source: ${offer.sourceName}`
              : ` · source: ${offer.source}`}
          </span>
          <span>
            Reviewed by a person before publication. Always confirm current
            terms.
          </span>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
