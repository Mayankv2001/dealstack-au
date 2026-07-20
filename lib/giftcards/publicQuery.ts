import type { GiftCardOffer } from "@/lib/offers/types";
import { isExpiringSoonAU, isPastExpiry, todayAU } from "@/lib/offers/expiry";
import { effectiveDiscountPercent } from "./value";
import { giftCardDateState } from "./dateState";
import { isConfirmedCurrent } from "./lifecycle";
import { isUpcomingSoonGiftCardOffer } from "./currentOffers";

/**
 * Pure query layer for the public /gift-cards page: tab/filter/sort over the
 * ALREADY-APPROVED offers (`getGiftCardOffers()` — RLS-published rows only).
 * URL-state driven and unit-testable; no I/O.
 */

export const GIFT_CARD_TABS = [
  "all",
  "discounts",
  "bonus-value",
  "points",
  "membership",
  "multi-retailer",
  "expiring",
] as const;
export type GiftCardTab = (typeof GIFT_CARD_TABS)[number];

export const TAB_LABEL: Record<GiftCardTab, string> = {
  all: "All",
  discounts: "Discounts",
  "bonus-value": "Bonus value",
  points: "Points",
  membership: "Membership offers",
  "multi-retailer": "Multi-retailer cards",
  expiring: "Expiring soon",
};

export const GIFT_CARD_SORTS = [
  "recommended",
  "saving",
  "expiring",
  "newest",
  "checked",
  "accepted",
] as const;
export type GiftCardSort = (typeof GIFT_CARD_SORTS)[number];

export const GC_SORT_LABEL: Record<GiftCardSort, string> = {
  recommended: "Recommended",
  saving: "Highest effective saving",
  expiring: "Expiring soon",
  newest: "Newest",
  checked: "Most recently checked",
  accepted: "Most widely accepted",
};

export interface GiftCardQueryParams {
  q: string;
  tab: GiftCardTab;
  sort: GiftCardSort;
  seller: string | null;
  program: string | null;
  membership: boolean;
  activation: boolean;
  format: "digital" | "physical" | null;
  /** Minimum effective saving %, e.g. 5. */
  minSave: number | null;
  /** Hide offers whose current dates were not confirmed. */
  confirmedCurrentOnly: boolean;
}

export const GC_DEFAULTS: GiftCardQueryParams = {
  q: "",
  tab: "all",
  sort: "recommended",
  seller: null,
  program: null,
  membership: false,
  activation: false,
  format: null,
  minSave: null,
  // Show every current reviewed offer by default — including unknown-expiry
  // rows, which are honestly labelled and demoted by the recommended sort.
  // The opt-in filter (`?dates=confirmed`) narrows to confirmed dates only.
  confirmedCurrentOnly: false,
};

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export function parseGiftCardParams(raw: Raw): GiftCardQueryParams {
  const params = { ...GC_DEFAULTS };
  params.q = first(raw.q).slice(0, 80);
  const tab = first(raw.tab);
  if ((GIFT_CARD_TABS as readonly string[]).includes(tab)) {
    params.tab = tab as GiftCardTab;
  }
  const sort = first(raw.sort);
  if ((GIFT_CARD_SORTS as readonly string[]).includes(sort)) {
    params.sort = sort as GiftCardSort;
  }
  params.seller = first(raw.seller) || null;
  params.program = first(raw.program) || null;
  params.membership = first(raw.membership) === "1";
  params.activation = first(raw.activation) === "1";
  const format = first(raw.format);
  if (format === "digital" || format === "physical") params.format = format;
  const minSave = Number.parseFloat(first(raw.minSave));
  if (Number.isFinite(minSave) && minSave > 0 && minSave < 100) {
    params.minSave = minSave;
  }
  // `dates=confirmed` opts INTO the confirmed-dates-only filter; the legacy
  // `dates=all` (and no param) both mean the default full current set.
  params.confirmedCurrentOnly = first(raw.dates) === "confirmed";
  return params;
}

export function giftCardHref(
  params: GiftCardQueryParams,
  overrides: Partial<GiftCardQueryParams> = {},
): string {
  const merged = { ...params, ...overrides };
  const query = new URLSearchParams();
  if (merged.q) query.set("q", merged.q);
  if (merged.tab !== "all") query.set("tab", merged.tab);
  if (merged.sort !== "recommended") query.set("sort", merged.sort);
  if (merged.seller) query.set("seller", merged.seller);
  if (merged.program) query.set("program", merged.program);
  if (merged.membership) query.set("membership", "1");
  if (merged.activation) query.set("activation", "1");
  if (merged.format) query.set("format", merged.format);
  if (merged.minSave != null) query.set("minSave", String(merged.minSave));
  if (merged.confirmedCurrentOnly) query.set("dates", "confirmed");
  const qs = query.toString();
  return qs ? `/gift-cards?${qs}` : "/gift-cards";
}

/** The one effective-saving figure per offer (shared formulas). */
export function offerEffectiveSaving(offer: GiftCardOffer): number | null {
  return effectiveDiscountPercent({
    promotionType: offer.promotionType ?? "discount",
    discountPercent: offer.discountPercent || null,
    bonusPercent: offer.bonusPercent ?? null,
    pointsMultiplier: offer.pointsMultiplier ?? null,
    fixedPoints: offer.fixedPoints ?? null,
    pointsProgram:
      offer.pointsProgram ?? offer.pointsOnPurchase?.program ?? null,
    pointsValueCents: offer.pointsValueCents ?? null,
    fixedDiscountDollars: offer.fixedDiscountDollars ?? null,
    promoCreditDollars: offer.promoCreditDollars ?? null,
    feeWaiverDollars: offer.feeWaiverDollars ?? null,
    thresholdDollars: offer.thresholdDollars ?? null,
  });
}

export function isMultiRetailer(offer: GiftCardOffer): boolean {
  return (
    offer.acceptedAtMerchantIds.length > 1 ||
    (offer.acceptedAt?.length ?? 0) >= 3
  );
}

/**
 * A reviewed offer is current only while its Sydney date window is open.
 * Future and expired rows never qualify merely because an expiry exists;
 * missing dates qualify only when explicitly reviewed as ongoing.
 */
export function isConfirmedCurrentGiftCardOffer(
  offer: GiftCardOffer,
  now: Date = new Date(),
): boolean {
  if (!offer.expiryDate && offer.isOngoing !== true) return false;
  return isConfirmedCurrent(
    {
      id: offer.id,
      startDate: offer.startDate,
      expiryDate: offer.expiryDate,
      isOngoing: offer.isOngoing,
      isActive: true,
    },
    now,
  );
}

function searchText(offer: GiftCardOffer): string {
  return [
    offer.brand,
    offer.source,
    offer.sourceName,
    offer.purchaseLocation,
    offer.pointsProgram ?? offer.pointsOnPurchase?.program,
    ...(offer.acceptedAt ?? []),
    ...offer.acceptedAtMerchantIds,
    offer.promotionType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesTab(
  offer: GiftCardOffer,
  tab: GiftCardTab,
  now: Date,
): boolean {
  switch (tab) {
    case "all":
      return true;
    case "discounts":
      return (
        offer.discountPercent > 0 ||
        (offer.fixedDiscountDollars ?? 0) > 0 ||
        offer.promotionType === "fee-waiver"
      );
    case "bonus-value":
      return (offer.bonusPercent ?? 0) > 0;
    case "points":
      return (
        (offer.pointsMultiplier ?? 0) > 0 || offer.pointsOnPurchase != null
      );
    case "membership":
      return (
        offer.membershipRequired === true ||
        offer.channel === "membership-portal"
      );
    case "multi-retailer":
      return isMultiRetailer(offer);
    case "expiring":
      return isExpiringSoonAU(offer.expiryDate, now);
  }
}

export function queryGiftCardOffers(
  offers: GiftCardOffer[],
  params: GiftCardQueryParams,
  now: Date = new Date(),
): GiftCardOffer[] {
  const today = todayAU(now);
  const tokens = params.q.toLowerCase().split(/\s+/).filter(Boolean);

  const filtered = offers.filter((offer) => {
    if (isPastExpiry(offer.expiryDate, today)) return false;
    // A future start date must never appear ACTIVE. Rows starting within the
    // shared upcoming window stay listed — the card view-model labels them
    // "Starts D Mon YYYY" — so the grid and the homepage carousel expose the
    // same offer set. Far-future rows remain hidden.
    if (
      giftCardDateState(offer, now) === "future" &&
      !isUpcomingSoonGiftCardOffer(offer, now)
    ) {
      return false;
    }
    if (
      params.confirmedCurrentOnly &&
      !isConfirmedCurrentGiftCardOffer(offer, now)
    ) {
      return false;
    }
    if (!matchesTab(offer, params.tab, now)) return false;
    if (tokens.length > 0) {
      const haystack = searchText(offer);
      if (!tokens.every((token) => haystack.includes(token))) return false;
    }
    if (
      params.seller &&
      !(offer.source + " " + (offer.purchaseLocation ?? ""))
        .toLowerCase()
        .includes(params.seller.toLowerCase())
    ) {
      return false;
    }
    if (params.program) {
      const program = (
        offer.pointsProgram ??
        offer.pointsOnPurchase?.program ??
        ""
      ).toLowerCase();
      if (!program.includes(params.program.toLowerCase())) return false;
    }
    if (
      params.membership &&
      offer.membershipRequired !== true &&
      offer.channel !== "membership-portal"
    ) {
      return false;
    }
    if (params.activation && offer.activationRequired !== true) return false;
    if (params.format) {
      const format = offer.format ?? "unknown";
      if (format !== params.format && format !== "digital-and-physical") {
        return false;
      }
    }
    if (params.minSave != null) {
      const saving = offerEffectiveSaving(offer);
      if (saving == null || saving < params.minSave) return false;
    }
    return true;
  });

  const time = (iso: string | null | undefined) => {
    if (!iso) return 0;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? 0 : ms;
  };
  const acceptedCount = (offer: GiftCardOffer) =>
    Math.max(offer.acceptedAtMerchantIds.length, offer.acceptedAt?.length ?? 0);

  const sorted = [...filtered];
  switch (params.sort) {
    case "saving":
      sorted.sort(
        (a, b) =>
          (offerEffectiveSaving(b) ?? -1) - (offerEffectiveSaving(a) ?? -1),
      );
      break;
    case "expiring":
      sorted.sort((a, b) =>
        (a.expiryDate ?? "9999-12-31").localeCompare(
          b.expiryDate ?? "9999-12-31",
        ),
      );
      break;
    case "newest":
      sorted.sort((a, b) => time(b.startDate) - time(a.startDate));
      break;
    case "checked":
      sorted.sort((a, b) => time(b.lastCheckedAt) - time(a.lastCheckedAt));
      break;
    case "accepted":
      sorted.sort((a, b) => acceptedCount(b) - acceptedCount(a));
      break;
    default: {
      // Recommended: effective saving, boosted by confirmed trust and urgency,
      // demoted by membership walls. Mirrors the deals Recommended philosophy.
      const score = (offer: GiftCardOffer) => {
        let s = (offerEffectiveSaving(offer) ?? 0) * 2;
        if (!isConfirmedCurrentGiftCardOffer(offer, now)) s -= 100;
        if (offer.confidence === "confirmed") s += 6;
        if (isExpiringSoonAU(offer.expiryDate, now)) s += 3;
        if (offer.membershipRequired === true) s -= 2;
        s += Math.min(acceptedCount(offer), 5);
        return s;
      };
      sorted.sort((a, b) => score(b) - score(a));
    }
  }
  return sorted;
}
