import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractedOffer } from "@/lib/giftcards/extractOffer";
import type { AcceptanceCandidateDraft } from "@/lib/giftcards/parseMerchantList";
import type { GiftCardAcceptanceRow } from "@/lib/offers/types";

const mocks = vi.hoisted(() => ({
  loadOffers: vi.fn(),
  loadConfirmedOffers: vi.fn(),
  stageOffer: vi.fn(),
  confirmRefresh: vi.fn(),
  audit: vi.fn(),
  listPredictions: vi.fn(),
  recordPrediction: vi.fn(),
  currentAcceptance: vi.fn(),
  listAcceptanceCandidates: vi.fn(),
  stageStaleAcceptance: vi.fn(),
  toDraft: vi.fn((candidate: unknown) => candidate),
}));

vi.mock("@/lib/admin/repos/giftCardReconcileStore", () => ({
  loadStoredOfferReconcileRecords: mocks.loadOffers,
  loadConfirmedOffersForPredictionReconcile: mocks.loadConfirmedOffers,
  stageStoredOfferReconcileResult: mocks.stageOffer,
  confirmStoredOfferRefresh: mocks.confirmRefresh,
  recordGiftCardReconcileAudit: mocks.audit,
}));
vi.mock("@/lib/admin/repos/giftCardPredictions", () => ({
  listPredictions: mocks.listPredictions,
  recordPredictionReconcileOutcome: mocks.recordPrediction,
}));
vi.mock("@/lib/admin/repos/giftCardAcceptance", () => ({
  listAcceptanceCandidates: mocks.listAcceptanceCandidates,
  stageStaleAcceptanceRecheck: mocks.stageStaleAcceptance,
  acceptanceCandidateToDraft: mocks.toDraft,
}));
vi.mock("@/lib/repos/giftCardProducts", () => ({
  getAllGiftCardAcceptance: mocks.currentAcceptance,
}));

import { loadReconcileInputs } from "@/lib/admin/repos/giftCardReconcileData";

const offer = (): ExtractedOffer => ({
  subOfferKey: "apple-coles",
  parentIsCompound: false,
  sourcePresence: "present",
  promotionType: "points",
  rewardDestination: "loyalty-points",
  sellerName: "Coles",
  giftCardBrands: ["Apple"],
  discountPercent: null,
  bonusPercent: null,
  pointsMultiplier: 20,
  fixedPoints: null,
  pointsProgram: "Flybuys",
  fixedDiscountDollars: null,
  promoCreditDollars: null,
  feeWaiverDollars: null,
  thresholdDollars: null,
  effectiveDiscountPercent: null,
  startsAt: "2026-07-15",
  expiresAt: "2026-07-21",
  isOngoing: false,
  sourceMarkedExpired: false,
  membershipRequired: false,
  activationRequired: false,
  couponRequired: false,
  targeted: false,
  minSpend: null,
  purchaseLimitNote: null,
  confidence: 0.9,
  warnings: [],
});

const acceptance = {
  id: "acceptance-1",
  productId: "ultimate",
  storeId: "jb-hifi",
  merchantName: "JB Hi-Fi",
} as GiftCardAcceptanceRow;

describe("gift-card reconciliation live data boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadOffers.mockResolvedValue({ available: true, records: [] });
    mocks.loadConfirmedOffers.mockResolvedValue([]);
    mocks.listPredictions.mockResolvedValue({ available: true, rows: [] });
    mocks.currentAcceptance.mockResolvedValue([]);
    mocks.listAcceptanceCandidates.mockResolvedValue([]);
    mocks.stageOffer.mockResolvedValue("staged");
    mocks.confirmRefresh.mockResolvedValue("confirmed");
    mocks.recordPrediction.mockResolvedValue("updated");
    mocks.stageStaleAcceptance.mockResolvedValue(false);
    mocks.audit.mockResolvedValue(undefined);
  });

  it("loads stored offer lineage and delegates material changes to private staging", async () => {
    const record = {
      key: "raw-1:apple-coles",
      sourceId: "gcdb",
      rawItemId: "raw-1",
      subOfferKey: "apple-coles",
      snapshotHash: "hash-1",
      rawUpdatedAt: "2026-07-15T01:00:00.000Z",
      item: {
        offerId: "offer-1",
        before: offer(),
        after: { ...offer(), pointsMultiplier: 30 },
      },
    };
    mocks.loadOffers.mockResolvedValue({ available: true, records: [record] });
    const inputs = await loadReconcileInputs();
    expect(inputs.items).toEqual([record.item]);

    const result = {
      offerId: "offer-1",
      outcome: "changed-points-multiplier" as const,
      changedFields: ["pointsMultiplier"],
      requiresReview: true,
      autoRefresh: false,
    };
    await inputs.apply.stageChanged(result);
    expect(mocks.stageOffer).toHaveBeenCalledWith(
      record,
      result,
      expect.any(Date),
    );
  });

  it("uses the same stored context for refresh, unavailable, and expiry adapters", async () => {
    const record = {
      key: "raw-1:apple-coles",
      sourceId: "gcdb",
      rawItemId: "raw-1",
      subOfferKey: "apple-coles",
      snapshotHash: "hash-1",
      rawUpdatedAt: "2026-07-15T01:00:00.000Z",
      item: { offerId: "offer-1", before: offer(), after: offer() },
    };
    mocks.loadOffers.mockResolvedValue({ available: true, records: [record] });
    const archiveConfirmedExpired = vi.fn(async () => {});
    const capturedNow = new Date("2026-07-15T02:03:04.000Z");
    const inputs = await loadReconcileInputs({
      archiveConfirmedExpired,
      now: capturedNow,
    });
    const base = {
      offerId: "offer-1",
      changedFields: [],
      requiresReview: false,
      autoRefresh: false,
    };
    await inputs.apply.refresh({ ...base, outcome: "unchanged", autoRefresh: true });
    await inputs.apply.markSourceUnavailable({
      ...base,
      outcome: "source-unavailable",
      requiresReview: true,
      sourcePresentIntent: false,
    });
    await inputs.apply.handleExpired({ ...base, outcome: "expired" });
    expect(mocks.confirmRefresh).toHaveBeenCalledWith(record);
    expect(mocks.stageOffer).toHaveBeenCalledTimes(1);
    expect(mocks.stageOffer).toHaveBeenCalledWith(
      record,
      expect.objectContaining({ outcome: "source-unavailable" }),
      capturedNow,
    );
    expect(archiveConfirmedExpired).toHaveBeenCalledWith(
      record,
      expect.objectContaining({ outcome: "expired" }),
      capturedNow,
    );
  });

  it("fails closed when confirmed expiry has no lifecycle boundary", async () => {
    const record = {
      key: "raw-1:apple-coles",
      sourceId: "gcdb",
      rawItemId: "raw-1",
      subOfferKey: "apple-coles",
      snapshotHash: "hash-1",
      rawUpdatedAt: "2026-07-15T01:00:00.000Z",
      item: { offerId: "offer-1", before: offer(), after: offer() },
    };
    mocks.loadOffers.mockResolvedValue({ available: true, records: [record] });
    const inputs = await loadReconcileInputs();
    await expect(
      inputs.apply.handleExpired({
        offerId: "offer-1",
        outcome: "expired",
        changedFields: [],
        requiresReview: false,
        autoRefresh: false,
      }),
    ).rejects.toThrow("lifecycle boundary is unavailable");
    expect(mocks.stageOffer).not.toHaveBeenCalled();
  });

  it("loads only unresolved predictions and persists outcomes privately", async () => {
    mocks.listPredictions.mockResolvedValue({
      available: true,
      rows: [
        {
          id: "prediction-open",
          predictedSeller: "Coles",
          predictedFamilies: ["Apple"],
          predictedPromotionType: "points",
          predictedValue: "20x",
          predictedStartsAt: "2026-07-15",
          predictedEndsAt: "2026-07-21",
          status: "predicted",
        },
        {
          id: "prediction-reviewed",
          predictedSeller: "Coles",
          predictedFamilies: ["Apple"],
          predictedPromotionType: "points",
          predictedValue: "20x",
          predictedStartsAt: "2026-07-15",
          predictedEndsAt: "2026-07-21",
          status: "prediction_matched",
        },
      ],
    });
    mocks.loadConfirmedOffers.mockResolvedValue([{ id: "offer-1" }]);
    const inputs = await loadReconcileInputs();
    expect(inputs.predictionInputs.predictions.map((row) => row.id)).toEqual([
      "prediction-open",
    ]);
    expect(inputs.predictionInputs.confirmedOffers).toEqual([{ id: "offer-1" }]);
    const outcome = {
      predictionId: "prediction-open",
      outcome: "exact-match" as const,
      linkedOfferId: "offer-1",
    };
    await inputs.apply.recordPredictionOutcome(outcome);
    expect(mocks.recordPrediction).toHaveBeenCalledWith(outcome, expect.any(Date));
  });

  it("stages and audits one stale acceptance recheck without changing the public fact", async () => {
    mocks.currentAcceptance.mockResolvedValue([acceptance]);
    mocks.stageStaleAcceptance.mockResolvedValue(true);
    const inputs = await loadReconcileInputs();
    await inputs.apply.recordAcceptanceOutcome({
      currentId: "acceptance-1",
      candidate: null,
      outcomes: ["became-stale"],
    });
    expect(mocks.stageStaleAcceptance).toHaveBeenCalledWith(acceptance);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "gift-card-acceptance-stale-recheck",
        tableName: "gift_card_acceptance_candidates",
        diff: expect.objectContaining({
          reconciledAt: expect.any(String),
          publicAcceptanceMutated: false,
        }),
      }),
    );
  });

  it("reuses already-private acceptance additions and removals without duplicating them", async () => {
    const addition: AcceptanceCandidateDraft = {
      rawMerchantName: "New merchant",
      sourceId: "issuer-list",
      proposedProductId: "ultimate",
      resolvedStoreId: "new-merchant",
      resolutionState: "resolved",
      changeKind: "new",
      linkedAcceptanceId: null,
      proposedValues: {},
    };
    const removal: AcceptanceCandidateDraft = {
      ...addition,
      rawMerchantName: "Old merchant",
      changeKind: "removed",
      linkedAcceptanceId: "acceptance-1",
    };
    mocks.listAcceptanceCandidates.mockResolvedValue([addition, removal]);
    mocks.currentAcceptance.mockResolvedValue([acceptance]);
    const inputs = await loadReconcileInputs();
    expect(inputs.acceptanceInputs.candidates).toEqual([addition, removal]);
    await inputs.apply.recordAcceptanceOutcome({
      currentId: null,
      candidate: addition,
      outcomes: ["merchant-added"],
    });
    await inputs.apply.recordAcceptanceOutcome({
      currentId: "acceptance-1",
      candidate: removal,
      outcomes: ["merchant-removed"],
    });
    expect(mocks.stageStaleAcceptance).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("degrades missing 028/029 inputs to honest empty sets", async () => {
    mocks.loadOffers.mockResolvedValue({ available: false, records: [] });
    mocks.listPredictions.mockResolvedValue({ available: false, rows: [] });
    mocks.currentAcceptance.mockResolvedValue([]);
    mocks.listAcceptanceCandidates.mockResolvedValue([]);
    const inputs = await loadReconcileInputs();
    expect(inputs.items).toEqual([]);
    expect(inputs.predictionInputs).toEqual({ predictions: [], confirmedOffers: [] });
    expect(inputs.acceptanceInputs).toEqual({ current: [], candidates: [] });
    expect(mocks.stageOffer).not.toHaveBeenCalled();
    expect(mocks.recordPrediction).not.toHaveBeenCalled();
  });

  it("does not reinterpret intentional source disablement as unavailability", async () => {
    mocks.loadOffers.mockResolvedValue({ available: true, records: [] });
    const inputs = await loadReconcileInputs();
    expect(inputs.items).toEqual([]);
    expect(mocks.stageOffer).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
