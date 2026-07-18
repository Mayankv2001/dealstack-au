import { stores as staticStores, type Store } from "@/lib/data";
import { findMerchantIdInText } from "@/lib/sources/normalise";
import type { Citation, Confidence } from "@/lib/sources/types";
import {
  cashbackOffers as staticCashbackOffers,
  giftCardOffers as staticGiftCardOffers,
  ozBargainSignals as staticOzBargainSignals,
  pointsOffers as staticPointsOffers,
} from "@/lib/offers/manualOffers";
import type {
  CashbackOffer,
  GiftCardOffer,
  OzBargainSignal,
  PointsOffer,
  StackComponent,
  StackRecommendation,
  StackWarning,
} from "@/lib/offers/types";
import {
  isActiveDateRange,
  melbourneDateKey,
  mondayOfWeek,
} from "@/lib/offers/availability";
import {
  capReachedWarning,
  eligibleSpendCapWarning,
  expirySoonWarning,
  giftCardCashbackConflictWarning,
  needsVerificationWarning,
  staleDataWarning,
  worstConfidence,
} from "./compatibility";

/**
 * The stack engine.
 *
 * Pure and testable: given a `StackData` bundle (stores + offers) it combines
 * the best compatible layer from each — discount code, discounted gift card,
 * cashback, points — and returns StackRecommendations. No network, no UI.
 *
 * Data is INJECTED so it can come from either the static files or the Supabase
 * repos. `buildStackRecommendations` defaults to the static bundle (keeping
 * existing callers working), and `buildStackRecommendationsFromStatic` is an
 * explicit static wrapper.
 */

/** The data the engine needs; supplied by static files or the repos. */
export interface StackData {
  stores: Store[];
  giftCardOffers: GiftCardOffer[];
  cashbackOffers: CashbackOffer[];
  pointsOffers: PointsOffer[];
  ozBargainSignals: OzBargainSignal[];
}

/** The static bundle (default for `buildStackRecommendations`). */
export const STATIC_STACK_DATA: StackData = {
  stores: staticStores,
  giftCardOffers: staticGiftCardOffers,
  cashbackOffers: staticCashbackOffers,
  pointsOffers: staticPointsOffers,
  ozBargainSignals: staticOzBargainSignals,
};

/** Default example basket used for the dollar estimates. */
export const DEFAULT_SPEND = 500;

export interface BuildStackOptions {
  /** Injectable clock for deterministic tests; production defaults to now. */
  now?: Date;
}

const round = (value: number) => Math.round(value * 100) / 100;

const MANUAL_CITATION: Citation = { source: "manual", sourceUrl: "/" };

/** Highest-discount gift card accepted at this merchant, or null. */
function bestGiftCard(
  offers: GiftCardOffer[],
  merchantId: string,
  today: string
): GiftCardOffer | null {
  const accepted = offers.filter(
    (o) =>
      o.acceptedAtMerchantIds.includes(merchantId) &&
      o.confidence !== "expired-unknown" &&
      isActiveDateRange(o.startDate, o.expiryDate, today)
  );
  if (accepted.length === 0) return null;
  return accepted.reduce((best, o) =>
    o.discountPercent > best.discountPercent ? o : best
  );
}

/** Highest-rate cashback at this merchant, or null. */
function bestCashback(
  offers: CashbackOffer[],
  merchantId: string,
  base: number,
  today: string
): CashbackOffer | null {
  const matches = offers.filter(
    (o) =>
      o.merchantId === merchantId &&
      o.confidence !== "expired-unknown" &&
      isActiveDateRange(null, o.expiryDate, today)
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, o) =>
    calculateCashbackSaving(base, o) > calculateCashbackSaving(base, best)
      ? o
      : best
  );
}

/** Best points offer at this merchant (highest multiplier), or null. */
function bestPoints(
  offers: PointsOffer[],
  merchantId: string,
  today: string
): PointsOffer | null {
  const matches = offers.filter(
    (o) =>
      o.merchantId === merchantId &&
      o.confidence !== "expired-unknown" &&
      isActiveDateRange(null, o.expiryDate, today)
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, o) =>
    (o.earnMultiple ?? 0) > (best.earnMultiple ?? 0) ? o : best
  );
}

/** Gift-card cap is the maximum face value eligible for the discount. */
function calculateGiftCardSaving(
  base: number,
  percent: number,
  capDollars: number | null
): number {
  const eligibleSpend = capDollars === null ? base : Math.min(base, capDollars);
  return eligibleSpend * (percent / 100);
}

/** Cashback cap is the maximum reward paid, not an eligible-spend cap. */
function calculateCashbackSaving(base: number, offer: CashbackOffer): number {
  const raw =
    offer.flatAmount !== null && offer.flatAmount > 0
      ? offer.flatAmount
      : base * (offer.ratePercent / 100);
  return offer.capDollars === null ? raw : Math.min(raw, offer.capDollars);
}

/**
 * Build one recommendation for a single store at the given spend, or null when
 * the store has no usable savings layer.
 */
function buildForStore(
  store: Store,
  spend: number,
  data: StackData,
  now: Date,
  today: string,
  weekOf: string
): StackRecommendation | null {
  const components: StackComponent[] = [];
  const warnings: StackWarning[] = [];
  const citations: Citation[] = [];
  const confidences: Confidence[] = [];

  let running = spend; // price after each cash-reducing layer

  // 1 ── Discount code (from the existing Store model) ──────────────────────
  if (
    store.discountPercent > 0 &&
    isActiveDateRange(null, store.expiryDate, today)
  ) {
    const discountSaving = round(running * (store.discountPercent / 100));
    running = round(running - discountSaving);
    components.push({
      layer: "discount",
      label: `${store.discountPercent}% off with ${store.discountCode}`,
      valuePercent: store.discountPercent,
      valueDollars: discountSaving,
      optional: false,
      citation: MANUAL_CITATION,
      confidence: "needs-verification",
      note: "Public promo code from the existing store listing.",
    });
    citations.push(MANUAL_CITATION);
    confidences.push("needs-verification");
    const expiryWarn = expirySoonWarning(
      store.expiryDate,
      now,
      `The ${store.discountCode} code`
    );
    if (expiryWarn) warnings.push(expiryWarn);
  }

  const checkoutPrice = running; // basis for gift card / cashback / points

  // 2 ── Gift card + cashback (resolve the common payment conflict) ─────────
  const giftCard = bestGiftCard(data.giftCardOffers, store.id, today);
  const cashback = bestCashback(
    data.cashbackOffers,
    store.id,
    checkoutPrice,
    today
  );

  const giftCardSaving = giftCard
    ? round(
        calculateGiftCardSaving(
          checkoutPrice,
          giftCard.discountPercent,
          giftCard.capDollars
        )
      )
    : 0;
  const cashbackSaving = cashback
    ? round(calculateCashbackSaving(checkoutPrice, cashback))
    : 0;

  // If both exist and cashback excludes gift card payment, keep the larger.
  let useGiftCard = giftCard !== null;
  let useCashback = cashback !== null;
  if (giftCard && cashback && cashback.excludesGiftCardPayment) {
    if (giftCardSaving >= cashbackSaving) {
      useCashback = false;
    } else {
      useGiftCard = false;
    }
    warnings.push(giftCardCashbackConflictWarning(cashback, true)!);
  }

  if (useGiftCard && giftCard) {
    running = round(running - giftCardSaving);
    components.push({
      layer: "gift-card",
      label: `${giftCard.discountPercent}% off via ${giftCard.brand} cards (${giftCard.source})`,
      valuePercent: giftCard.discountPercent,
      valueDollars: giftCardSaving,
      optional: false,
      citation: giftCard.citations[0] ?? MANUAL_CITATION,
      confidence: giftCard.confidence,
      note: giftCard.pointsOnPurchase
        ? `Also earns ${giftCard.pointsOnPurchase.program}: ${giftCard.pointsOnPurchase.earnNote}`
        : undefined,
    });
    citations.push(...giftCard.citations);
    confidences.push(giftCard.confidence);
    const gcExpiry = expirySoonWarning(
      giftCard.expiryDate,
      now,
      `The ${giftCard.brand} gift card offer`
    );
    if (gcExpiry) warnings.push(gcExpiry);
    const gcStale = staleDataWarning(
      giftCard.lastCheckedAt,
      now,
      `The ${giftCard.brand} gift card offer`
    );
    if (gcStale) warnings.push(gcStale);
    const gcVerify = needsVerificationWarning(
      giftCard.confidence,
      `The ${giftCard.brand} gift card offer`
    );
    if (gcVerify) warnings.push(gcVerify);
    const gcCap = eligibleSpendCapWarning(
      giftCard.capDollars,
      checkoutPrice,
      `The ${giftCard.brand} gift card offer`
    );
    if (gcCap) warnings.push(gcCap);
  } else if (giftCard) {
    // Dropped due to conflict — surface as an optional layer.
    components.push({
      layer: "gift-card",
      label: `${giftCard.discountPercent}% off via ${giftCard.brand} cards (alternative to cashback)`,
      valuePercent: giftCard.discountPercent,
      valueDollars: giftCardSaving,
      optional: true,
      citation: giftCard.citations[0] ?? MANUAL_CITATION,
      confidence: giftCard.confidence,
      note: "Use instead of cashback, not together.",
    });
  }

  if (useCashback && cashback) {
    running = round(running - cashbackSaving);
    components.push({
      layer: "cashback",
      label: `${
        cashback.flatAmount !== null && cashback.flatAmount > 0
          ? `$${cashback.flatAmount}`
          : `${cashback.ratePercent}%`
      } ${cashback.provider} cashback${cashback.isUpsized ? " (upsized)" : ""}`,
      valuePercent: cashback.ratePercent,
      valueDollars: cashbackSaving,
      optional: false,
      citation: cashback.citations[0] ?? MANUAL_CITATION,
      confidence: cashback.confidence,
      note: cashback.termsSummary,
    });
    citations.push(...cashback.citations);
    confidences.push(cashback.confidence);
    const cbExpiry = expirySoonWarning(
      cashback.expiryDate,
      now,
      `The ${cashback.provider} cashback offer`
    );
    if (cbExpiry) warnings.push(cbExpiry);
    const cbStale = staleDataWarning(
      cashback.lastCheckedAt,
      now,
      `The ${cashback.provider} cashback offer`
    );
    if (cbStale) warnings.push(cbStale);
    const cbVerify = needsVerificationWarning(
      cashback.confidence,
      `The ${cashback.provider} cashback offer`
    );
    if (cbVerify) warnings.push(cbVerify);
    const rawCashback =
      cashback.flatAmount !== null && cashback.flatAmount > 0
        ? cashback.flatAmount
        : checkoutPrice * (cashback.ratePercent / 100);
    const cbCap = capReachedWarning(
      cashback.capDollars,
      rawCashback,
      `The ${cashback.provider} cashback offer`
    );
    if (cbCap) warnings.push(cbCap);
  } else if (cashback) {
    components.push({
      layer: "cashback",
      label: `${
        cashback.flatAmount !== null && cashback.flatAmount > 0
          ? `$${cashback.flatAmount}`
          : `${cashback.ratePercent}%`
      } ${cashback.provider} cashback (alternative to gift card)`,
      valuePercent: cashback.ratePercent,
      valueDollars: cashbackSaving,
      optional: true,
      citation: cashback.citations[0] ?? MANUAL_CITATION,
      confidence: cashback.confidence,
      note: "Use instead of the gift card, not together.",
    });
  }

  // 3 ── Points (informational — value is not deducted from the cash price) ─
  let pointsEarned = 0;
  let pointsValueDollars = 0;
  const points = bestPoints(data.pointsOffers, store.id, today);
  if (points && points.earnMultiple) {
    pointsEarned = Math.round(checkoutPrice * points.earnMultiple);
    pointsValueDollars = round(
      pointsEarned * ((points.pointValueCents ?? 0) / 100)
    );
    components.push({
      layer: "points",
      label: `${points.earnRateDisplay} on ${points.program}`,
      pointsEarned,
      valueDollars: pointsValueDollars,
      optional: false,
      citation: points.citations[0] ?? MANUAL_CITATION,
      confidence: points.confidence,
      note: "Points value is indicative and is not subtracted from the cash price.",
    });
    citations.push(...points.citations);
    confidences.push(points.confidence);
    const ptExpiry = expirySoonWarning(
      points.expiryDate,
      now,
      `The ${points.program} points offer`
    );
    if (ptExpiry) warnings.push(ptExpiry);
    const ptVerify = needsVerificationWarning(
      points.confidence,
      `The ${points.program} points offer`
    );
    if (ptVerify) warnings.push(ptVerify);
  }

  // Nothing to stack → no recommendation.
  if (components.filter((c) => !c.optional).length === 0) return null;

  // OzBargain signals contribute citations/context, not savings.
  for (const signal of data.ozBargainSignals) {
    if (
      signal.merchantId === store.id &&
      signal.confidence !== "expired-unknown" &&
      signal.status !== "expired" &&
      isActiveDateRange(null, signal.expiryDate, today)
    ) {
      citations.push({ source: "ozbargain", sourceUrl: signal.sourceUrl });
    }
  }

  const effectivePrice = round(running);
  const totalSaving = round(spend - effectivePrice);
  const effectiveDiscountPercent =
    spend > 0 ? round((totalSaving / spend) * 100) : 0;

  return {
    merchantId: store.id,
    merchantName: store.name,
    title: `${store.name} weekly stack`,
    basePrice: spend,
    components,
    effectivePrice,
    effectiveDiscountPercent,
    totalSaving,
    pointsEarned,
    pointsValueDollars,
    confidence: worstConfidence(confidences),
    warnings,
    citations: dedupeCitations(citations),
    weekOf,
  };
}

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of citations) {
    const key = `${c.source}|${c.sourceUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Build stack recommendations.
 *
 * @param input  Optional store id or free-text query. When it resolves to a
 *               known merchant, only that store is returned. Otherwise all
 *               stores with a usable stack are returned, best saving first.
 * @param spend  Example basket size. Defaults to DEFAULT_SPEND ($500).
 * @param data   Injected data bundle. Defaults to the static bundle so existing
 *               callers keep working; pass repo-loaded data for the DB path.
 */
export function buildStackRecommendations(
  input?: string,
  spend: number = DEFAULT_SPEND,
  data: StackData = STATIC_STACK_DATA,
  options: BuildStackOptions = {}
): StackRecommendation[] {
  const basket = Number.isFinite(spend) && spend > 0 ? spend : DEFAULT_SPEND;
  const now = options.now ?? new Date();
  const today = melbourneDateKey(now);
  const weekOf = mondayOfWeek(today);

  let targets: Store[] = data.stores;
  if (input && input.trim()) {
    const merchantId =
      data.stores.find((s) => s.id === input.trim())?.id ??
      findMerchantIdInText(input);
    if (merchantId) {
      targets = data.stores.filter((s) => s.id === merchantId);
    }
  }

  return targets
    .map((store) => buildForStore(store, basket, data, now, today, weekOf))
    .filter((r): r is StackRecommendation => r !== null)
    .sort((a, b) => b.totalSaving - a.totalSaving);
}

/** Explicit static wrapper — identical output to the pre-DB behaviour. */
export function buildStackRecommendationsFromStatic(
  input?: string,
  spend: number = DEFAULT_SPEND
): StackRecommendation[] {
  return buildStackRecommendations(input, spend, STATIC_STACK_DATA);
}
