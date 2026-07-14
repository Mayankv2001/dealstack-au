import type { GiftCardOffer } from "@/lib/offers/types";
import { todayAU } from "@/lib/offers/expiry";
import { safePublicSourceUrl } from "@/lib/security/urlPolicy";
import { buildWorkedExample } from "./value";

export type WeeklyOfferView =
  | "week"
  | "coles"
  | "woolworths"
  | "flybuys"
  | "everyday-rewards"
  | "history";

export const WEEKLY_VIEW_LABEL: Record<WeeklyOfferView, string> = {
  week: "This week",
  coles: "Coles",
  woolworths: "Woolworths",
  flybuys: "Flybuys",
  "everyday-rewards": "Everyday Rewards",
  history: "Offer history",
};

function lower(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isWeeklySupermarketOffer(offer: GiftCardOffer): boolean {
  const seller = lower(offer.purchaseLocation ?? offer.source);
  return (
    offer.channel === "supermarket-promo" &&
    (seller.includes("coles") || seller.includes("woolworths")) &&
    Boolean(offer.startDate) &&
    Boolean(offer.expiryDate)
  );
}

/** Confirmed dates activate and expire using Australia/Sydney calendar days. */
export function weeklyOfferIsActive(
  offer: GiftCardOffer,
  now: Date = new Date(),
): boolean {
  if (!isWeeklySupermarketOffer(offer)) return false;
  const today = todayAU(now);
  return offer.startDate! <= today && offer.expiryDate! >= today;
}

export function queryWeeklyOffers(
  offers: GiftCardOffer[],
  view: Exclude<WeeklyOfferView, "history">,
  now: Date = new Date(),
): GiftCardOffer[] {
  return offers
    .filter((offer) => weeklyOfferIsActive(offer, now))
    .filter((offer) => {
      const seller = lower(offer.purchaseLocation ?? offer.source);
      const programme = lower(
        offer.pointsProgram ?? offer.pointsOnPurchase?.program,
      );
      if (view === "coles") return seller.includes("coles");
      if (view === "woolworths") return seller.includes("woolworths");
      if (view === "flybuys") return programme.includes("flybuys");
      if (view === "everyday-rewards")
        return programme.includes("everyday rewards");
      return true;
    })
    .sort((a, b) => {
      const seller = lower(a.purchaseLocation).localeCompare(
        lower(b.purchaseLocation),
      );
      return seller || a.brand.localeCompare(b.brand);
    });
}

export function parseWeeklyView(value: string | undefined): WeeklyOfferView {
  return value && Object.hasOwn(WEEKLY_VIEW_LABEL, value)
    ? (value as WeeklyOfferView)
    : "week";
}

export interface WeeklyAttribution {
  retailerEvidenceUrl: string | null;
  discoverySource: { name: string; url: string } | null;
  corroboration: Array<{ name: string; url: string }>;
  reviewStatus: string;
}

function isRetailerEvidence(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return (
    host === "coles.com.au" ||
    host.endsWith(".coles.com.au") ||
    host === "woolworths.com.au" ||
    host.endsWith(".woolworths.com.au")
  );
}

export function weeklyAttribution(offer: GiftCardOffer): WeeklyAttribution {
  const citations = offer.citations.flatMap((citation) => {
    const url = safePublicSourceUrl(citation.sourceUrl);
    return url ? [{ name: citation.source, url }] : [];
  });
  const terms = offer.termsUrl ? safePublicSourceUrl(offer.termsUrl) : null;
  const retailerEvidenceUrl =
    (terms && isRetailerEvidence(terms) ? terms : null) ??
    citations.find(({ url }) => isRetailerEvidence(url))?.url ??
    null;
  const discovery = citations.find(({ url, name }) => {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("pointhacks.com.au") || lower(name).includes("point hacks");
  });
  const sourceDetail = offer.sourceDetailUrl
    ? safePublicSourceUrl(offer.sourceDetailUrl)
    : null;
  const discoverySource = discovery
    ? { name: "Point Hacks", url: discovery.url }
    : sourceDetail && new URL(sourceDetail).hostname.includes("pointhacks.com.au")
      ? { name: "Point Hacks", url: sourceDetail }
      : null;
  const excluded = new Set(
    [retailerEvidenceUrl, discoverySource?.url].filter(Boolean),
  );
  return {
    retailerEvidenceUrl,
    discoverySource,
    corroboration: citations
      .filter(({ url }) => !excluded.has(url))
      .map(({ name, url }) => ({ name, url })),
    reviewStatus:
      offer.confidence === "confirmed"
        ? "DealStack verification completed"
        : "Reviewed; verification incomplete",
  };
}

function moneyList(note: string | null | undefined): number[] {
  if (!note) return [];
  return [
    ...new Set(
      [...note.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)]
        .map((match) => Number(match[1].replace(/,/g, "")))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ].sort((a, b) => a - b);
}

function variableRange(
  note: string | null | undefined,
): { min: number; max: number } | null {
  if (!note || !/variable/i.test(note)) return null;
  const values = moneyList(note);
  return values.length >= 2
    ? { min: values[0], max: values[values.length - 1] }
    : null;
}

function fixedMix(
  target: number,
  denominations: number[],
): Array<{ denomination: number; count: number }> | null {
  if (denominations.length === 0) return null;
  const cents = denominations.map((value) => Math.round(value * 100));
  const targetCents = Math.ceil(target * 100);
  const max = Math.max(...cents);
  const limit = targetCents + max;
  const previous = new Int32Array(limit + 1).fill(-1);
  previous[0] = 0;
  for (let total = 0; total <= limit; total += 1) {
    if (previous[total] === -1 && total !== 0) continue;
    for (const denomination of cents) {
      const next = total + denomination;
      if (next <= limit && previous[next] === -1) previous[next] = denomination;
    }
  }
  let total = targetCents;
  while (total <= limit && previous[total] === -1) total += 1;
  if (total > limit) return null;
  const counts = new Map<number, number>();
  while (total > 0) {
    const denomination = previous[total];
    if (denomination <= 0) return null;
    counts.set(denomination, (counts.get(denomination) ?? 0) + 1);
    total -= denomination;
  }
  return [...counts.entries()]
    .map(([denomination, count]) => ({ denomination: denomination / 100, count }))
    .sort((a, b) => b.denomination - a.denomination);
}

function variableMix(
  target: number,
  range: { min: number; max: number },
): Array<{ denomination: number; count: number }> {
  const full = Math.floor(target / range.max);
  const remainder = Math.round((target - full * range.max) * 100) / 100;
  const mix: Array<{ denomination: number; count: number }> = [];
  const add = (denomination: number, count = 1) => {
    const existing = mix.find((item) => item.denomination === denomination);
    if (existing) existing.count += count;
    else mix.push({ denomination, count });
  };
  if (full > 0) add(range.max, full);
  if (remainder > 0) {
    if (remainder >= range.min) add(remainder);
    else if (full > 0) {
      // Split one maximum-load card so the final card can meet the minimum
      // without losing the small remainder (e.g. $510 becomes $490 + $20).
      const maximum = mix.find((item) => item.denomination === range.max);
      if (maximum) {
        maximum.count -= 1;
        if (maximum.count === 0) mix.splice(mix.indexOf(maximum), 1);
      }
      add(Math.round((range.max - (range.min - remainder)) * 100) / 100);
      add(range.min);
    } else add(range.min);
  }
  return mix.sort((a, b) => b.denomination - a.denomination);
}

function limitFromText(
  text: string | null | undefined,
  kind: "day" | "member" | "customer",
): number | null {
  const match = text?.match(
    new RegExp(`(?:limit\\s+(?:of\\s+)?)?(\\d+)\\s+(?:per\\s+)?${kind}`, "i"),
  );
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export interface WeeklyPurchasePlan {
  intendedSpend: number;
  eligibleSpend: number;
  maximumEligiblePurchase: number | null;
  cardMix: Array<{ denomination: number; count: number }> | null;
  requiredCardQuantity: number | null;
  shoppingDays: number | null;
  cashPaid: number;
  immediateCashSaving: number;
  bonusCardValue: number | null;
  pointsEarned: number | null;
  estimatedRewardsValue: number | null;
  unusedGiftCardBalance: number | null;
  redemptionMerchantId: string | null;
  warnings: string[];
}

export function buildWeeklyPurchasePlan(
  offer: GiftCardOffer,
  intendedSpend: number,
): WeeklyPurchasePlan {
  const spend =
    Number.isFinite(intendedSpend) && intendedSpend > 0
      ? Math.min(intendedSpend, 100_000)
      : 500;
  const eligibleSpend =
    offer.capDollars != null && offer.capDollars > 0
      ? Math.min(spend, offer.capDollars)
      : spend;
  const range = variableRange(offer.denominationNote);
  const denominations = range ? [] : moneyList(offer.denominationNote);
  const cardMix = range
    ? variableMix(eligibleSpend, range)
    : fixedMix(eligibleSpend, denominations);
  const faceValue = cardMix
    ? cardMix.reduce(
        (total, item) => total + item.denomination * item.count,
        0,
      )
    : eligibleSpend;
  const quantity = cardMix
    ? cardMix.reduce((total, item) => total + item.count, 0)
    : null;
  const perDay = limitFromText(offer.limitPerCustomer, "day");
  const perMember = limitFromText(offer.limitPerCustomer, "member");
  const perCustomer = limitFromText(offer.limitPerCustomer, "customer");
  const countLimit = perMember ?? perCustomer;
  const allowedQuantity =
    quantity != null && countLimit != null ? Math.min(quantity, countLimit) : quantity;
  const allowedFace =
    cardMix && allowedQuantity != null && allowedQuantity < (quantity ?? 0)
      ? cardMix
          .flatMap((item) => Array(item.count).fill(item.denomination))
          .sort((a, b) => b - a)
          .slice(0, allowedQuantity)
          .reduce((total, value) => total + value, 0)
      : faceValue;
  const worked = buildWorkedExample(
    {
      promotionType: offer.promotionType ?? "discount",
      discountPercent: offer.discountPercent || null,
      bonusPercent: offer.bonusPercent ?? null,
      pointsMultiplier: offer.pointsMultiplier ?? null,
      fixedPoints: offer.fixedPoints ?? null,
      pointsProgram:
        offer.pointsProgram ?? offer.pointsOnPurchase?.program ?? null,
      pointsValueCents: offer.pointsValueCents ?? null,
      capDollars: offer.capDollars,
    },
    allowedFace,
  );
  const redemptionIds = [...new Set(offer.acceptedAtMerchantIds.filter(Boolean))];
  const warnings: string[] = [];
  if (!offer.denominationNote)
    warnings.push("Card denominations are not recorded; quantity cannot be confirmed.");
  if (!offer.limitPerCustomer)
    warnings.push("Per-customer and per-day limits are not recorded.");
  if (redemptionIds.length !== 1)
    warnings.push("A single redemption merchant cannot be determined from approved evidence.");
  warnings.push("Compatibility with cashback and promo codes requires separate evidence.");
  return {
    intendedSpend: spend,
    eligibleSpend: Math.min(eligibleSpend, allowedFace),
    maximumEligiblePurchase: offer.capDollars,
    cardMix,
    requiredCardQuantity: quantity,
    shoppingDays:
      quantity != null && perDay != null ? Math.ceil(quantity / perDay) : null,
    cashPaid: worked?.cashPaid ?? allowedFace,
    immediateCashSaving: worked?.acquisitionSaving ?? 0,
    bonusCardValue: worked?.bonusValueDollars ?? null,
    pointsEarned: worked?.points ?? null,
    estimatedRewardsValue: worked?.rewardValueDollars ?? null,
    unusedGiftCardBalance: cardMix
      ? Math.max(0, Math.round((allowedFace - eligibleSpend) * 100) / 100)
      : null,
    redemptionMerchantId: redemptionIds.length === 1 ? redemptionIds[0] : null,
    warnings,
  };
}

export function weeklyPlanHref(offer: GiftCardOffer, spend = 500): string {
  const query = new URLSearchParams({ offer: offer.id, spend: String(spend) });
  return `/gift-cards/weekly/plan?${query.toString()}`;
}
