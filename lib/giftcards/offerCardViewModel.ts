import type { GiftCardOffer } from "@/lib/offers/types";
import { expiryUrgencyLabelAU } from "@/lib/offers/expiry";
import { evaluateGiftCardCompatibility } from "@/lib/giftcards/compatibility";
import { giftCardDateState } from "@/lib/giftcards/dateState";

/**
 * Pure presentation view-model for one public gift-card offer card.
 *
 * The card component must NOT read raw offer fields directly — every string it
 * renders is derived here, deterministically and unit-testably. This is where
 * the production-data hazards are neutralised:
 *   - `brand` is a comma-separated list (up to 33 entries, 500+ chars). It is
 *     split into a single `brandPrimary` + a "+N more" `brandSecondary` so a
 *     card never renders a raw list and never grows unbounded.
 *   - a missing (`null`) date is reported as "Date unknown", never
 *     "Ongoing" — we cannot assert an offer is evergreen just because the
 *     source omitted an end date.
 *   - headlines are short and mechanic-driven; the brand is shown separately.
 *   - seller, source, mechanic, value and trust are separated into distinct
 *     labels so the card reads consistently across every promotion type.
 */

export type GiftCardCompatibilityTone =
  "positive" | "warning" | "negative" | "neutral";

export interface GiftCardOfferCardViewModel {
  /** Where you buy the card (purchase location), e.g. "Amazon". */
  sellerLabel: string;
  /** Publisher or evidence source; never merged with the seller. */
  sourceLabel: string;
  /** Compact redemption destination from reviewed merchant fields. */
  redeemAtLabel: string;
  /** Promotion class, e.g. "Discount", "Points", "Bonus points". */
  mechanicLabel: string;
  /** Compact value pill, e.g. "10% OFF", "20× POINTS", "BONUS POINTS". */
  valueBadge: string;
  /** First brand in the list — the card's heading. */
  brandPrimary: string;
  /** "+N more" when the offer covers multiple brands; omitted for single. */
  brandSecondary?: string;
  /** Total number of included brands (>= 1). */
  brandCount: number;
  /** Short, mechanic-driven sentence — never contains the raw brand list. */
  headline: string;
  /** Truthful date line: "Ends 13 Jul 2026", "Ongoing" or "Date unknown". */
  dateLabel: string;
  /** "Ends in 3 days" / "Ends today" — only when genuinely expiring soon. */
  urgencyLabel?: string;
  /** Data-confidence label, e.g. "Verified" / "Source-checked". */
  trustLabel: string;
  /** Stack-readiness label mirrored from the shared compatibility evaluator. */
  compatibilityLabel: string;
  compatibilityTone: GiftCardCompatibilityTone;
  /** Present only for points/bonus offers. */
  pointsDisclosure?: string;
  detailHref: string;
  buildStackHref?: string;
  /** Resolved brand logo asset, or null → render initials. */
  logoSrc: string | null;
  /** 1–2 letter fallback when there is no logo. */
  initials: string;
}

/** Brand → public logo asset. Keys are lowercased and matched by inclusion. */
const LOGOS: Record<string, string> = {
  amazon: "/logos/amazon-au.png",
  "chemist warehouse": "/logos/chemist-warehouse.avif",
  coles: "/logos/coles.svg",
  "jb hi-fi": "/logos/jb-hi-fi.png",
  kogan: "/logos/kogan.png",
  myer: "/logos/myer.png",
  "the good guys": "/logos/the-good-guys.svg",
  woolworths: "/logos/woolworths.webp",
  wish: "/logos/woolworths.webp",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-07-13" → "13 Jul 2026". DST-immune (formats the date parts). */
function formatAuDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;
  const [, y, m, d] = match;
  const month = MONTHS[Number(m) - 1] ?? m;
  return `${Number(d)} ${month} ${y}`;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const displayNumber = (value: number) =>
  Number.isInteger(round1(value))
    ? String(round1(value))
    : round1(value).toFixed(1);

/** Split the stored comma-list into trimmed brand names (never splits on "&"). */
export function splitBrandList(brand: string): string[] {
  return brand
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

type Mechanic =
  | "discount"
  | "fixed-dollar-discount"
  | "member-discount"
  | "bonus-value"
  | "points"
  | "bonus-points"
  | "promo-credit"
  | "fee-waiver"
  | "offer";

/** One authoritative classification so mechanic/badge/headline can never diverge. */
function classify(offer: GiftCardOffer): Mechanic {
  if (offer.promotionType === "promo-credit") return "promo-credit";
  if (offer.promotionType === "fee-waiver") return "fee-waiver";
  if (offer.promotionType === "fixed-dollar-discount") {
    return "fixed-dollar-discount";
  }
  if ((offer.bonusPercent ?? 0) > 0 || offer.promotionType === "bonus-value") {
    return "bonus-value";
  }
  if ((offer.pointsMultiplier ?? 0) > 0 || offer.promotionType === "points") {
    return "points";
  }
  if (offer.pointsOnPurchase != null) return "bonus-points";
  if (offer.discountPercent > 0) {
    return offer.membershipRequired || offer.channel === "membership-portal"
      ? "member-discount"
      : "discount";
  }
  return "offer";
}

function pointsProgram(offer: GiftCardOffer): string {
  return offer.pointsProgram ?? offer.pointsOnPurchase?.program ?? "points";
}

function mechanicLabel(mechanic: Mechanic): string {
  switch (mechanic) {
    case "discount":
      return "Discount";
    case "member-discount":
      return "Member rate";
    case "fixed-dollar-discount":
      return "Fixed discount";
    case "bonus-value":
      return "Bonus value";
    case "points":
      return "Points";
    case "bonus-points":
      return "Bonus points";
    case "promo-credit":
      return "Promo credit";
    case "fee-waiver":
      return "Fee waiver";
    case "offer":
      return "Member offer";
  }
}

function valueBadge(offer: GiftCardOffer, mechanic: Mechanic): string {
  switch (mechanic) {
    case "bonus-value":
      return `${displayNumber(offer.bonusPercent ?? 0)}% BONUS`;
    case "points":
      return offer.pointsMultiplier
        ? `${displayNumber(offer.pointsMultiplier)}× POINTS`
        : "POINTS";
    case "member-discount":
      return `${displayNumber(offer.discountPercent)}% MEMBER`;
    case "fixed-dollar-discount":
      return `$${displayNumber(offer.fixedDiscountDollars ?? 0)} OFF`;
    case "discount":
      return `${displayNumber(offer.discountPercent)}% OFF`;
    case "bonus-points":
      return "BONUS POINTS";
    case "promo-credit":
      return `$${displayNumber(offer.promoCreditDollars ?? 0)} CREDIT`;
    case "fee-waiver":
      return offer.feeWaiverDollars
        ? `$${displayNumber(offer.feeWaiverDollars)} FEE SAVED`
        : "NO FEE";
    case "offer":
      return "OFFER";
  }
}

function headline(offer: GiftCardOffer, mechanic: Mechanic): string {
  switch (mechanic) {
    case "discount":
      return `${displayNumber(offer.discountPercent)}% off face value`;
    case "member-discount":
      return `${displayNumber(offer.discountPercent)}% off for members`;
    case "fixed-dollar-discount":
      return `$${displayNumber(offer.fixedDiscountDollars ?? 0)} off at checkout`;
    case "bonus-value":
      return `${displayNumber(offer.bonusPercent ?? 0)}% bonus value`;
    case "points":
      return offer.pointsMultiplier
        ? `${displayNumber(offer.pointsMultiplier)}× ${pointsProgram(offer)} points`
        : `${pointsProgram(offer)} points`;
    case "bonus-points":
      return `Bonus ${pointsProgram(offer)} points`;
    case "promo-credit":
      return `$${displayNumber(offer.promoCreditDollars ?? 0)} future seller credit`;
    case "fee-waiver":
      return "Purchase fee waived";
    case "offer":
      return "Reviewed member offer";
  }
}

const COMPAT_LABEL = {
  compatible: "Confirmed compatible",
  "likely-compatible": "Likely compatible",
  "requires-verification": "Unknown",
  "insufficient-evidence": "Unknown",
  incompatible: "Conflicting",
} as const;

const COMPAT_TONE: Record<
  keyof typeof COMPAT_LABEL,
  GiftCardCompatibilityTone
> = {
  compatible: "positive",
  "likely-compatible": "positive",
  "requires-verification": "warning",
  "insufficient-evidence": "neutral",
  incompatible: "negative",
};

function resolveLogo(brandPrimary: string, sellerLabel: string): string | null {
  const candidates = [brandPrimary, sellerLabel]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  for (const candidate of candidates) {
    const match = Object.entries(LOGOS).find(
      ([name]) => candidate.includes(name) || name.includes(candidate),
    );
    if (match) return match[1];
  }
  return null;
}

function initialsFor(brandPrimary: string): string {
  const words = brandPrimary.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "GC";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function buildGiftCardOfferCardViewModel(
  offer: GiftCardOffer,
  now: Date = new Date(),
): GiftCardOfferCardViewModel {
  const mechanic = classify(offer);

  const brands = splitBrandList(offer.brand);
  const brandPrimary = brands[0] ?? offer.brand.trim() ?? "Gift card";
  const brandCount = Math.max(brands.length, 1);
  const brandSecondary = brandCount > 1 ? `+${brandCount - 1} more` : undefined;

  const sellerLabel = (offer.purchaseLocation ?? offer.source ?? "").trim();
  const sourceCandidate = (offer.sourceName ?? offer.source ?? "").trim();
  const sourceLabel = sourceCandidate || "Source unavailable";
  const redemptionNames = [
    ...new Set(
      [...(offer.acceptedAt ?? []), ...offer.acceptedAtMerchantIds].filter(
        Boolean,
      ),
    ),
  ];
  const redeemAtLabel = redemptionNames.length
    ? `${redemptionNames[0]}${redemptionNames.length > 1 ? ` +${redemptionNames.length - 1}` : ""}`
    : "See conditions";

  const dateState = giftCardDateState(offer, now);
  const dateLabel =
    dateState === "future" && offer.startDate
      ? `Starts ${formatAuDate(offer.startDate)}${
          offer.expiryDate ? ` · ends ${formatAuDate(offer.expiryDate)}` : ""
        }`
      : offer.expiryDate
        ? `Ends ${formatAuDate(offer.expiryDate)}`
        : dateState === "ongoing"
          ? "Ongoing"
          : "Date unknown";
  const urgencyLabel = expiryUrgencyLabelAU(offer.expiryDate, now) ?? undefined;

  const trustLabel =
    offer.confidence === "confirmed"
      ? "Verified by DealStack"
      : "Source checked";

  const status = evaluateGiftCardCompatibility(offer, { now }).status;
  const compatibilityLabel = COMPAT_LABEL[status];
  const compatibilityTone = COMPAT_TONE[status];

  const isPoints =
    mechanic === "points" ||
    mechanic === "bonus-points" ||
    offer.pointsOnPurchase != null;

  const primaryStore = offer.acceptedAtMerchantIds[0];

  return {
    sellerLabel: sellerLabel || brandPrimary,
    sourceLabel,
    redeemAtLabel,
    mechanicLabel: mechanicLabel(mechanic),
    valueBadge: valueBadge(offer, mechanic),
    brandPrimary,
    brandSecondary,
    brandCount,
    headline: headline(offer, mechanic),
    dateLabel,
    urgencyLabel,
    trustLabel,
    compatibilityLabel,
    compatibilityTone,
    pointsDisclosure: isPoints ? "Points are rewards, not cash." : undefined,
    detailHref: `/gift-cards/${offer.id}`,
    buildStackHref: primaryStore
      ? `/?stack=${encodeURIComponent(primaryStore)}#calculator`
      : undefined,
    logoSrc: resolveLogo(brandPrimary, sellerLabel),
    initials: initialsFor(brandPrimary),
  };
}
