import { describe, expect, it } from "vitest";
import {
  flagPossibleDuplicates,
  reconcileOffers,
  type ReconcileItem,
  type ReconcileOutcome,
} from "@/lib/giftcards/reconcileOffers";
import { reconcilePredictions, type PredictionInput, type ConfirmedOfferInput } from "@/lib/giftcards/reconcilePredictions";
import type { ExtractedOffer } from "@/lib/giftcards/extractOffer";
import type {
  DedupCandidate,
  PublishedOfferSummary,
} from "@/lib/giftcards/duplicateDetection";

const NOW = new Date("2026-07-15T02:00:00Z"); // 2026-07-15 AEST

function ext(o: Partial<ExtractedOffer> = {}): ExtractedOffer {
  return {
    subOfferKey: "primary",
    parentIsCompound: false,
    sourcePresence: "present",
    promotionType: "discount",
    rewardDestination: "checkout-discount",
    sellerName: "Coles",
    giftCardBrands: ["Apple"],
    discountPercent: 10,
    bonusPercent: null,
    pointsMultiplier: null,
    fixedPoints: null,
    pointsProgram: null,
    fixedDiscountDollars: null,
    promoCreditDollars: null,
    feeWaiverDollars: null,
    thresholdDollars: null,
    effectiveDiscountPercent: 10,
    startsAt: "2026-07-10",
    expiresAt: "2026-07-20",
    isOngoing: false,
    sourceMarkedExpired: false,
    whileStocksLast: false,
    membershipRequired: false,
    activationRequired: false,
    couponRequired: false,
    targeted: false,
    minSpend: null,
    purchaseLimitNote: null,
    confidence: 0.9,
    warnings: [],
    ...o,
  };
}
const item = (o: Partial<ReconcileItem> & { offerId: string | null }): ReconcileItem => ({
  before: null,
  after: null,
  ...o,
});

describe("reconcileOffers — outcome taxonomy", () => {
  it("new-offer: source item with no canonical match", () => {
    const [r] = reconcileOffers([item({ offerId: null, after: ext() })], NOW).results;
    expect(r.outcome).toBe("new-offer");
    expect(r.requiresReview).toBe(true);
  });

  it("unchanged: identical before/after (no review, no refresh)", () => {
    const [r] = reconcileOffers([item({ offerId: "a", before: ext(), after: ext() })], NOW).results;
    expect(r.outcome).toBe("unchanged");
    expect(r.requiresReview).toBe(false);
    expect(r.autoRefresh).toBe(true);
    expect(r.candidateDraft).toBeUndefined();
  });

  it("date-extension vs date-reduction", () => {
    const ext1 = reconcileOffers([item({ offerId: "a", before: ext({ expiresAt: "2026-07-20" }), after: ext({ expiresAt: "2026-07-27" }) })], NOW).results[0];
    expect(ext1.outcome).toBe("date-extension");
    const red = reconcileOffers([item({ offerId: "a", before: ext({ expiresAt: "2026-07-27" }), after: ext({ expiresAt: "2026-07-18" }) })], NOW).results[0];
    expect(red.outcome).toBe("date-reduction");
    expect(red.requiresReview).toBe(true);
  });

  it("changed-value / changed-points-multiplier / changed-cards / changed-seller", () => {
    expect(reconcileOffers([item({ offerId: "a", before: ext({ discountPercent: 10 }), after: ext({ discountPercent: 15 }) })], NOW).results[0].outcome).toBe("changed-value");
    expect(reconcileOffers([item({ offerId: "a", before: ext({ promotionType: "points", pointsMultiplier: 10, pointsProgram: "Flybuys", discountPercent: null }), after: ext({ promotionType: "points", pointsMultiplier: 20, pointsProgram: "Flybuys", discountPercent: null }) })], NOW).results[0].outcome).toBe("changed-points-multiplier");
    expect(reconcileOffers([item({ offerId: "a", before: ext({ giftCardBrands: ["Apple"] }), after: ext({ giftCardBrands: ["Apple", "Google"] }) })], NOW).results[0].outcome).toBe("changed-cards");
    expect(reconcileOffers([item({ offerId: "a", before: ext({ sellerName: "Coles" }), after: ext({ sellerName: "Woolworths" }) })], NOW).results[0].outcome).toBe("changed-seller");
  });

  it("changed-limit / changed-exclusions", () => {
    expect(reconcileOffers([item({ offerId: "a", before: ext({ minSpend: null }), after: ext({ minSpend: 100 }) })], NOW).results[0].outcome).toBe("changed-limit");
    expect(reconcileOffers([item({ offerId: "a", before: ext({ membershipRequired: false }), after: ext({ membershipRequired: true }) })], NOW).results[0].outcome).toBe("changed-exclusions");
  });

  it("changed-denomination / changed-retailer-evidence via source hints", () => {
    expect(reconcileOffers([item({ offerId: "a", before: ext(), after: ext(), denominationChanged: true })], NOW).results[0].outcome).toBe("changed-denomination");
    expect(reconcileOffers([item({ offerId: "a", before: ext(), after: ext(), retailerEvidenceChanged: true })], NOW).results[0].outcome).toBe("changed-retailer-evidence");
  });

  it("withdrawn (explicit) vs source-unavailable (mere absence, never expires)", () => {
    const w = reconcileOffers([item({ offerId: "a", before: ext(), after: null, withdrawalStated: true })], NOW).results[0];
    expect(w.outcome).toBe("withdrawn");
    const u = reconcileOffers([item({ offerId: "a", before: ext(), after: null })], NOW).results[0];
    expect(u.outcome).toBe("source-unavailable");
    expect(u.sourcePresentIntent).toBe(false);
  });

  it("expired: confirmed end passed and not ongoing", () => {
    const r = reconcileOffers([item({ offerId: "a", before: ext({ expiresAt: "2026-07-10" }), after: ext({ expiresAt: "2026-07-10" }), canonicalExpiryDate: "2026-07-10" })], NOW).results[0];
    expect(r.outcome).toBe("expired");
  });

  it("uses a passed canonical end as expiry evidence, not source disappearance", () => {
    const expired = reconcileOffers([
      item({
        offerId: "a",
        before: ext({ expiresAt: "2026-07-10" }),
        after: null,
        canonicalExpiryDate: "2026-07-10",
      }),
    ], NOW).results[0];
    expect(expired.outcome).toBe("expired");

    const missing = reconcileOffers([
      item({
        offerId: "b",
        before: ext({ expiresAt: "2026-07-20" }),
        after: null,
        canonicalExpiryDate: "2026-07-20",
      }),
    ], NOW).results[0];
    expect(missing.outcome).toBe("source-unavailable");
  });

  it("parse-failure and acceptance-change-hint", () => {
    expect(reconcileOffers([item({ offerId: "a", parseFailed: true })], NOW).results[0].outcome).toBe("parse-failure");
    const hint = reconcileOffers([item({ offerId: "a", before: ext(), after: ext({ warnings: ["merchant list changed"] }), acceptanceHint: true })], NOW).results[0];
    expect(hint.outcome).toBe("acceptance-change-hint");
  });

  it("summary counts requires-review vs auto-refresh; nothing is published", () => {
    const { summary } = reconcileOffers([
      item({ offerId: "a", before: ext(), after: ext() }),
      item({ offerId: "b", before: ext({ discountPercent: 10 }), after: ext({ discountPercent: 20 }) }),
      item({ offerId: null, after: ext() }),
    ], NOW);
    expect(summary.total).toBe(3);
    expect(summary.requiresReviewCount).toBe(2); // changed-value + new-offer
    expect(summary.autoRefreshCount).toBe(1);
  });

  it("maps material changes to a private candidate draft with a field-level diff", () => {
    const before = ext({ discountPercent: 10, effectiveDiscountPercent: 10 });
    const after = ext({ discountPercent: 15, effectiveDiscountPercent: 15 });
    const [result] = reconcileOffers([
      item({ offerId: "offer-1", before, after }),
    ], NOW).results;

    expect(result.candidateDraft).toMatchObject({
      extraction: after,
      changeKind: "material-offer",
      reviewStatus: "changed",
      changedFields: ["discountPercent", "effectiveDiscountPercent"],
      fieldDiff: [
        { field: "discountPercent", before: 10, after: 15 },
        { field: "effectiveDiscountPercent", before: 10, after: 15 },
      ],
    });
  });

  it("is byte-equivalent for identical inputs and a fixed clock", () => {
    const inputs = [
      item({ offerId: "a", before: ext(), after: ext() }),
      item({
        offerId: "b",
        before: ext({ startsAt: "2026-07-10" }),
        after: ext({ startsAt: "2026-07-11" }),
      }),
    ];
    const first = reconcileOffers(inputs, NOW);
    const second = reconcileOffers(inputs, NOW);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe("reconcileOffers — complete declared taxonomy", () => {
  const dedupCandidate: DedupCandidate = {
    sellerName: "Coles",
    giftCardBrands: ["Apple"],
    promotionType: "discount",
    discountPercent: 10,
    bonusPercent: null,
    pointsMultiplier: null,
    fixedPoints: null,
    pointsProgram: null,
    denominationNote: null,
    startsAt: "2026-07-10",
    expiresAt: "2026-07-20",
    sourceUrl: "https://example.com/apple-offer",
  };
  const published: PublishedOfferSummary = {
    id: "published-1",
    brand: "Apple",
    seller: "Coles",
    promotionType: "discount",
    discountPercent: 10,
    bonusPercent: null,
    pointsMultiplier: null,
    fixedPoints: null,
    pointsProgram: null,
    denominationNote: null,
    startDate: "2026-07-10",
    expiryDate: "2026-07-20",
    sourceDetailUrl: "https://example.com/apple-offer",
  };

  it("reaches every offer outcome, including the duplicate advisory", () => {
    const base = ext();
    const points = ext({
      promotionType: "points",
      rewardDestination: "loyalty-points",
      discountPercent: null,
      effectiveDiscountPercent: null,
      pointsMultiplier: 10,
      pointsProgram: "Flybuys",
    });
    const results = reconcileOffers([
      item({ offerId: null, after: base }),
      item({ offerId: "unchanged", before: base, after: base }),
      item({ offerId: "material", before: base, after: ext({ startsAt: "2026-07-11" }) }),
      item({ offerId: "extension", before: base, after: ext({ expiresAt: "2026-07-21" }) }),
      item({ offerId: "reduction", before: base, after: ext({ expiresAt: "2026-07-19" }) }),
      item({ offerId: "limit", before: base, after: ext({ minSpend: 100 }) }),
      item({ offerId: "denomination", before: base, after: base, denominationChanged: true }),
      item({ offerId: "cards", before: base, after: ext({ giftCardBrands: ["Apple", "TCN"] }) }),
      item({ offerId: "seller", before: base, after: ext({ sellerName: "Big W" }) }),
      item({ offerId: "value", before: base, after: ext({ discountPercent: 12, effectiveDiscountPercent: 12 }) }),
      item({ offerId: "points", before: points, after: { ...points, pointsMultiplier: 20 } }),
      item({ offerId: "exclusions", before: base, after: ext({ targeted: true }) }),
      item({ offerId: "evidence", before: base, after: base, retailerEvidenceChanged: true }),
      item({ offerId: "withdrawn", before: base, withdrawalStated: true }),
      item({ offerId: "expired", before: ext({ expiresAt: "2026-07-10" }), after: ext({ expiresAt: "2026-07-10" }) }),
      item({ offerId: "unavailable", before: base }),
      item({ offerId: "parse", parseFailed: true }),
      item({ offerId: "acceptance", before: base, after: base, acceptanceHint: true }),
    ], NOW).results;
    const duplicate = flagPossibleDuplicates(
      [{ id: "candidate-1", candidate: dedupCandidate }],
      [published],
      NOW,
    );
    const actual = new Set<ReconcileOutcome>([
      ...results.map((result) => result.outcome),
      ...duplicate.map((result) => result.outcome),
    ]);
    const expected: ReconcileOutcome[] = [
      "new-offer", "unchanged", "material-change", "date-extension",
      "date-reduction", "changed-limit", "changed-denomination",
      "changed-cards", "changed-seller", "changed-value",
      "changed-points-multiplier", "changed-exclusions",
      "changed-retailer-evidence", "withdrawn", "expired",
      "source-unavailable", "parse-failure", "possible-duplicate",
      "acceptance-change-hint",
    ];
    expect([...actual].sort()).toEqual([...expected].sort());
    expect(duplicate[0]?.matches[0]?.verdict).toBe("exact-duplicate");
  });
});

describe("reconcilePredictions — outcome taxonomy (isolated, read-only)", () => {
  const pred = (o: Partial<PredictionInput> & { id: string }): PredictionInput => ({
    predictedSeller: "Coles", predictedFamilies: ["Apple"], predictedPromotionType: "points",
    predictedValue: "20x", predictedStartsAt: "2026-07-10", predictedEndsAt: "2026-07-20", ...o,
  });
  const offer = (o: Partial<ConfirmedOfferInput> & { id: string }): ConfirmedOfferInput => ({
    seller: "Coles", families: ["Apple"], promotionType: "points", value: "20x",
    startDate: "2026-07-10", expiryDate: "2026-07-20", ...o,
  });

  it("exact-match links the offer; row is returned not overwritten", () => {
    const [r] = reconcilePredictions([pred({ id: "p" })], [offer({ id: "o" })], NOW);
    expect(r.outcome).toBe("exact-match");
    expect(r.linkedOfferId).toBe("o");
  });

  it("different-value / different-family / different-seller / different-dates", () => {
    expect(reconcilePredictions([pred({ id: "p", predictedValue: "20x" })], [offer({ id: "o", value: "10x" })], NOW)[0].outcome).toBe("different-value");
    expect(reconcilePredictions([pred({ id: "p", predictedFamilies: ["Apple"] })], [offer({ id: "o", families: ["Google"] })], NOW)[0].outcome).toBe("different-family");
    expect(reconcilePredictions([pred({ id: "p", predictedSeller: "Coles" })], [offer({ id: "o", seller: "Woolworths" })], NOW)[0].outcome).toBe("different-seller");
    expect(reconcilePredictions([pred({ id: "p", predictedStartsAt: "2026-08-01", predictedEndsAt: "2026-08-07" })], [offer({ id: "o", startDate: "2026-07-10", expiryDate: "2026-07-20" })], NOW)[0].outcome).toBe("different-dates");
  });

  it("no-promotion / did-not-occur / pending", () => {
    expect(reconcilePredictions([pred({ id: "p" })], [offer({ id: "o", promotionType: null, value: null })], NOW)[0].outcome).toBe("no-promotion");
    expect(reconcilePredictions([pred({ id: "p", predictedEndsAt: "2026-07-01" })], [], NOW)[0].outcome).toBe("did-not-occur");
    expect(reconcilePredictions([pred({ id: "p", predictedEndsAt: "2026-08-30" })], [], NOW)[0].outcome).toBe("pending");
  });

  it("partial-match is reachable when matching identity lacks a comparable value", () => {
    const [result] = reconcilePredictions([
      pred({ id: "p", predictedValue: null }),
    ], [offer({ id: "o" })], NOW);
    expect(result).toEqual({
      predictionId: "p",
      outcome: "partial-match",
      linkedOfferId: "o",
    });
  });

  it("reaches every prediction outcome and is deterministic at a fixed clock", () => {
    const cases: Array<{ prediction: PredictionInput; offers: ConfirmedOfferInput[] }> = [
      { prediction: pred({ id: "exact" }), offers: [offer({ id: "o-exact" })] },
      { prediction: pred({ id: "partial", predictedValue: null }), offers: [offer({ id: "o-partial" })] },
      { prediction: pred({ id: "value" }), offers: [offer({ id: "o-value", value: "10x" })] },
      { prediction: pred({ id: "family" }), offers: [offer({ id: "o-family", families: ["TCN"] })] },
      { prediction: pred({ id: "seller" }), offers: [offer({ id: "o-seller", seller: "Big W" })] },
      { prediction: pred({ id: "dates", predictedStartsAt: "2026-08-01", predictedEndsAt: "2026-08-07" }), offers: [offer({ id: "o-dates" })] },
      { prediction: pred({ id: "none" }), offers: [offer({ id: "o-none", promotionType: null, value: null })] },
      { prediction: pred({ id: "missed", predictedEndsAt: "2026-07-01" }), offers: [] },
      { prediction: pred({ id: "pending", predictedEndsAt: "2026-08-01" }), offers: [] },
    ];
    const outcomes = cases.map(({ prediction, offers }) =>
      reconcilePredictions([prediction], offers, NOW)[0],
    );
    expect(new Set(outcomes.map((result) => result.outcome))).toEqual(new Set([
      "exact-match", "partial-match", "different-value", "different-family",
      "different-seller", "different-dates", "no-promotion",
      "did-not-occur", "pending",
    ]));
    expect(JSON.stringify(cases.map(({ prediction, offers }) =>
      reconcilePredictions([prediction], offers, NOW)[0],
    ))).toBe(JSON.stringify(outcomes));
  });
});
