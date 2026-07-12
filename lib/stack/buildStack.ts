import { stores as staticStores, type Store } from "@/lib/data";
import { weekMondayAU } from "@/lib/admin/dateHelpers";
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
  StackKind,
  StackRecommendation,
  StackWarning,
} from "@/lib/offers/types";
import {
  capReachedWarning,
  cashbackCapReachedWarning,
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

const round = (value: number) => Math.round(value * 100) / 100;

const MANUAL_CITATION: Citation = { source: "manual", sourceUrl: "/" };

/** Most corroborating community citations one stack may carry. */
export const MAX_SIGNAL_CITATIONS = 3;

/**
 * Development-oriented words that must never reach a public card. Offer sample
 * data (and any DB rows seeded from it) prefixes free text with "Sample:",
 * "Illustrative", etc.; this scrubs them so shoppers see accurate wording.
 */
const DEV_TOKEN_RE =
  /\b(?:samples?|illustrative|demonstration|demo|fixture|placeholder)\b/gi;

/** Strip development wording from a public string and tidy the result. */
export function sanitisePublicText(text: string): string {
  if (!text) return text;
  const cleaned = text
    .replace(DEV_TOKEN_RE, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:;,.\-–—]+/, "")
    .trim();
  return cleaned.replace(/^([a-z])/, (m) => m.toUpperCase());
}

/** Codes we can safely tell the shopper to "use at checkout" (no spaces/phrases). */
function looksLikeCouponCode(code: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{1,19}$/.test(code.trim());
}

/** Customer-facing cashback wording derived from structured fields. */
function cashbackNote(cashback: CashbackOffer): string {
  const rate = `${cashback.ratePercent}%${cashback.isUpsized ? " (upsized rate)" : ""}`;
  const base = `Track your purchase through ${cashback.provider} to earn up to ${rate} cashback on eligible purchases.`;
  return cashback.excludesGiftCardPayment
    ? `${base} Not eligible when paying with gift cards.`
    : base;
}

/** Highest-discount gift card accepted at this merchant, or null. */
function bestGiftCard(
  offers: GiftCardOffer[],
  merchantId: string
): GiftCardOffer | null {
  const accepted = offers.filter((o) =>
    o.acceptedAtMerchantIds.includes(merchantId)
  );
  if (accepted.length === 0) return null;
  return accepted.reduce((best, o) =>
    o.discountPercent > best.discountPercent ? o : best
  );
}

/** Highest-rate cashback at this merchant, or null. */
function bestCashback(
  offers: CashbackOffer[],
  merchantId: string
): CashbackOffer | null {
  const matches = offers.filter((o) => o.merchantId === merchantId);
  if (matches.length === 0) return null;
  return matches.reduce((best, o) =>
    o.ratePercent > best.ratePercent ? o : best
  );
}

/** Best points offer at this merchant (highest multiplier), or null. */
function bestPoints(
  offers: PointsOffer[],
  merchantId: string
): PointsOffer | null {
  const matches = offers.filter((o) => o.merchantId === merchantId);
  if (matches.length === 0) return null;
  return matches.reduce((best, o) =>
    (o.earnMultiple ?? 0) > (best.earnMultiple ?? 0) ? o : best
  );
}

/** Gift-card layer: capDollars caps the ELIGIBLE SPEND ("up to $X per order"). */
function spendCappedSaving(
  base: number,
  percent: number,
  capDollars: number | null
): number {
  const eligible = capDollars === null ? base : Math.min(base, capDollars);
  return eligible * (percent / 100);
}

/** Cashback layer: capDollars caps the SAVING ITSELF ("capped at $X cashback"). */
function dollarCappedSaving(
  base: number,
  percent: number,
  capDollars: number | null
): number {
  const raw = base * (percent / 100);
  return capDollars === null ? raw : Math.min(raw, capDollars);
}

/**
 * Build one recommendation for a single store at the given spend, or null when
 * the store has no usable savings layer.
 */
function buildForStore(
  store: Store,
  spend: number,
  data: StackData,
  now: Date
): StackRecommendation | null {
  const components: StackComponent[] = [];
  const warnings: StackWarning[] = [];
  const citations: Citation[] = [];
  const confidences: Confidence[] = [];

  let running = spend; // price after each cash-reducing layer

  // 1 ── Discount code (from the existing Store model) ──────────────────────
  if (store.discountPercent > 0) {
    const discountSaving = round(running * (store.discountPercent / 100));
    running = round(running - discountSaving);
    components.push({
      layer: "discount",
      label: `${store.discountPercent}% off with ${store.discountCode}`,
      valuePercent: store.discountPercent,
      valueDollars: discountSaving,
      code: looksLikeCouponCode(store.discountCode) ? store.discountCode : undefined,
      optional: false,
      citation: MANUAL_CITATION,
      confidence: "needs-verification",
      note: looksLikeCouponCode(store.discountCode)
        ? `Use code ${store.discountCode} at checkout. Exclusions may apply.`
        : `Apply the ${store.discountPercent}% offer at checkout. Exclusions may apply.`,
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
  const giftCard = bestGiftCard(data.giftCardOffers, store.id);
  const cashback = bestCashback(data.cashbackOffers, store.id);

  const giftCardSaving = giftCard
    ? round(spendCappedSaving(checkoutPrice, giftCard.discountPercent, giftCard.capDollars))
    : 0;
  const cashbackSaving = cashback
    ? round(dollarCappedSaving(checkoutPrice, cashback.ratePercent, cashback.capDollars))
    : 0;

  // A layer that saves nothing (e.g. a 0%-discount gift card that only earns
  // bonus points) is not a cash layer — it must never render as "0% off".
  let useGiftCard = giftCard !== null && giftCardSaving > 0;
  let useCashback = cashback !== null && cashbackSaving > 0;
  // Only a genuine choice between two saving layers is a conflict.
  if (
    giftCard &&
    cashback &&
    cashback.excludesGiftCardPayment &&
    giftCardSaving > 0 &&
    cashbackSaving > 0
  ) {
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
    const gcCap = capReachedWarning(
      giftCard.capDollars,
      checkoutPrice,
      `The ${giftCard.brand} gift card offer`
    );
    if (gcCap) warnings.push(gcCap);
  } else if (giftCard && giftCardSaving > 0) {
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
      label: `${cashback.ratePercent}% ${cashback.provider} cashback${cashback.isUpsized ? " (upsized)" : ""}`,
      valuePercent: cashback.ratePercent,
      valueDollars: cashbackSaving,
      optional: false,
      citation: cashback.citations[0] ?? MANUAL_CITATION,
      confidence: cashback.confidence,
      note: cashbackNote(cashback),
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
    const cbCap = cashbackCapReachedWarning(
      cashback.capDollars,
      checkoutPrice * (cashback.ratePercent / 100), // raw, UNCAPPED saving
      `The ${cashback.provider} cashback offer`
    );
    if (cbCap) warnings.push(cbCap);
  } else if (cashback && cashbackSaving > 0) {
    components.push({
      layer: "cashback",
      label: `${cashback.ratePercent}% ${cashback.provider} cashback (alternative to gift card)`,
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
  const points = bestPoints(data.pointsOffers, store.id);
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

  // OzBargain signals contribute corroborating citations, not savings. A busy
  // merchant can have dozens of approved signals; pushing every one of them
  // was the root cause of the repeated-source-badge flood, so corroboration is
  // capped at the few most recently checked REAL signals (samples carry
  // placeholder URLs and are never cited).
  const corroborating = data.ozBargainSignals
    .filter((signal) => signal.merchantId === store.id && !signal.isSample)
    .sort((a, b) => (b.lastCheckedAt ?? "").localeCompare(a.lastCheckedAt ?? ""))
    .slice(0, MAX_SIGNAL_CITATIONS);
  for (const signal of corroborating) {
    citations.push({ source: "ozbargain", sourceUrl: signal.sourceUrl });
  }

  const effectivePrice = round(running);
  const totalSaving = round(spend - effectivePrice);
  const effectiveDiscountPercent =
    spend > 0 ? round((totalSaving / spend) * 100) : 0;
  // Only CONFIRMED cash layers may back the primary "you save" figure.
  const verifiedSaving = round(
    components
      .filter(
        (c) =>
          !c.optional &&
          c.layer !== "points" &&
          c.confidence === "confirmed" &&
          (c.valueDollars ?? 0) > 0
      )
      .reduce((sum, c) => sum + (c.valueDollars ?? 0), 0)
  );

  // Freshness: the OLDEST last-checked date among used offer-backed layers
  // (never overstates currency) and the soonest layer expiry.
  const usedChecks = [
    useGiftCard && giftCard ? giftCard.lastCheckedAt : null,
    useCashback && cashback ? cashback.lastCheckedAt : null,
    points?.lastCheckedAt ?? null,
  ].filter((iso): iso is string => Boolean(iso));
  const checkedAsOf = usedChecks.length ? [...usedChecks].sort()[0] : null;
  const usedExpiries = [
    store.discountPercent > 0 ? store.expiryDate : null,
    useGiftCard && giftCard ? giftCard.expiryDate : null,
    useCashback && cashback ? cashback.expiryDate : null,
    points?.expiryDate ?? null,
  ].filter((d): d is string => Boolean(d));
  const soonestExpiry = usedExpiries.length ? [...usedExpiries].sort()[0] : null;

  // Final scrub: no development wording ("Sample", "Illustrative", …) ever
  // reaches a public card, whatever the data source.
  const publicComponents: StackComponent[] = components.map((c) => ({
    ...c,
    label: sanitisePublicText(c.label),
    note: c.note ? sanitisePublicText(c.note) : c.note,
  }));

  // A stack is a cash saving when a non-optional discount/gift-card/cashback
  // layer actually reduces the price; otherwise, if it still earns points, it is
  // a points-only rewards opportunity (cash price unchanged).
  const hasCashSaving = publicComponents.some(
    (c) => !c.optional && c.layer !== "points" && (c.valueDollars ?? 0) > 0
  );
  const kind: StackKind =
    !hasCashSaving && pointsEarned > 0 ? "points-only" : "cash";

  return {
    merchantId: store.id,
    merchantName: store.name,
    kind,
    title: describeStack(publicComponents, store.name, kind),
    basePrice: spend,
    components: publicComponents,
    effectivePrice,
    effectiveDiscountPercent,
    totalSaving,
    verifiedSaving,
    checkedAsOf,
    soonestExpiry,
    pointsEarned,
    pointsValueDollars,
    confidence: worstConfidence(confidences),
    warnings,
    citations: dedupeCitations(citations),
    // AU-calendar Monday (DST-correct) — same helper the weekly-deal staleness
    // check uses, so a stack's weekOf can never disagree with isWeekOfStale.
    weekOf: weekMondayAU(now),
  };
}

/** Short human descriptor for one cash layer, e.g. "10% code" or "6% ShopBack". */
function describeCashLayer(c: StackComponent): string | null {
  if (c.layer === "points" || c.optional || (c.valueDollars ?? 0) <= 0) {
    return null;
  }
  const pct =
    typeof c.valuePercent === "number" && c.valuePercent > 0
      ? `${c.valuePercent}% `
      : "";
  if (c.layer === "discount") return `${pct}off code`.trim();
  if (c.layer === "gift-card") return `${pct}gift cards`.trim();
  // Cashback labels carry the provider (e.g. "6% ShopBack cashback").
  const provider = c.label.match(/\b(ShopBack|TopCashback)\b/)?.[1];
  return provider ? `${pct}${provider} cashback` : `${pct}cashback`.trim();
}

/**
 * Descriptive, layer-derived stack title — "10% off code + 6% ShopBack
 * cashback at Myer" — replacing the old generic "<store> weekly stack".
 */
export function describeStack(
  components: StackComponent[],
  merchantName: string,
  kind: StackKind
): string {
  if (kind === "points-only") {
    const points = components.find((c) => c.layer === "points");
    const label = points ? sanitisePublicText(points.label) : "Loyalty points";
    return `${label} at ${merchantName}`;
  }
  const parts = components
    .map(describeCashLayer)
    .filter((part): part is string => part !== null)
    .slice(0, 3);
  if (parts.length === 0) return `${merchantName} savings stack`;
  return `${parts.join(" + ")} at ${merchantName}`;
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
 * @param now    Injected clock. Defaults to the real wall clock so callers keep
 *               working; pass a fixed Date in tests for deterministic expiry and
 *               stale-data warnings.
 */
export function buildStackRecommendations(
  input?: string,
  spend: number = DEFAULT_SPEND,
  data: StackData = STATIC_STACK_DATA,
  now: Date = new Date()
): StackRecommendation[] {
  const basket = Number.isFinite(spend) && spend > 0 ? spend : DEFAULT_SPEND;

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
    .map((store) => buildForStore(store, basket, data, now))
    .filter((r): r is StackRecommendation => r !== null)
    .sort((a, b) => b.totalSaving - a.totalSaving);
}

/** Explicit static wrapper — identical output to the pre-DB behaviour. */
export function buildStackRecommendationsFromStatic(
  input?: string,
  spend: number = DEFAULT_SPEND,
  now: Date = new Date()
): StackRecommendation[] {
  return buildStackRecommendations(input, spend, STATIC_STACK_DATA, now);
}
