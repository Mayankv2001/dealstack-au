import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractedOffer } from "@/lib/giftcards/extractOffer";
import { reconcileOffers } from "@/lib/giftcards/reconcileOffers";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  stageCandidate: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/admin/repos/giftCardPipeline", () => ({
  stageCandidate: mocks.stageCandidate,
}));

import {
  buildStoredOfferReconcileRecords,
  loadStoredOfferReconcileRecords,
  stageStoredOfferReconcileResult,
  type StoredOfferReconcileRecord,
  type StoredReconcileCandidateRow,
  type StoredReconcileRawRow,
} from "@/lib/admin/repos/giftCardReconcileStore";
import { GiftCardLifecycleSchemaUnavailableError } from "@/lib/admin/repos/giftCardLifecycle";

const extraction = (overrides: Partial<ExtractedOffer> = {}): ExtractedOffer => ({
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
  activationRequired: true,
  couponRequired: false,
  targeted: false,
  minSpend: null,
  purchaseLimitNote: "Five cards",
  confidence: 0.95,
  warnings: [],
  ...overrides,
});

const raw = (
  values: unknown[] = [extraction()],
  overrides: Partial<StoredReconcileRawRow> = {},
): StoredReconcileRawRow => ({
  id: "raw-1",
  source_id: "gcdb",
  content_hash: "snapshot-1",
  raw_payload: { extraction: values[0], extractions: values },
  processing_status: "parsed",
  parser_error: null,
  last_seen_at: "2026-07-15T01:00:00.000Z",
  updated_at: "2026-07-15T01:00:00.000Z",
  ...overrides,
});

const candidate = (
  overrides: Partial<StoredReconcileCandidateRow> = {},
): StoredReconcileCandidateRow => ({
  id: "candidate-approved",
  raw_item_id: "raw-1",
  source_id: "gcdb",
  seller_name: "Coles",
  gift_card_brands: ["Apple"],
  promotion_type: "points",
  discount_percent: null,
  bonus_percent: null,
  points_multiplier: 20,
  points_program: "Flybuys",
  effective_discount_percent: null,
  starts_at: "2026-07-15",
  expires_at: "2026-07-21",
  terms_json: {
    subOfferKey: "apple-coles",
    rewardDestination: "loyalty-points",
    fixedPoints: null,
    activationRequired: true,
    purchaseLimitNote: "Five cards",
  },
  extraction_confidence: 0.95,
  extraction_warnings: [],
  review_status: "approved",
  approved_offer_id: "offer-1",
  created_at: "2026-07-14T00:00:00.000Z",
  ...overrides,
});

describe("stored gift-card reconciliation projection", () => {
  it("repairs an unstaged new raw extraction without inventing a public offer", () => {
    const records = buildStoredOfferReconcileRecords([raw()], []);
    expect(records).toHaveLength(1);
    expect(records[0].item).toMatchObject({
      offerId: null,
      before: null,
      after: { sellerName: "Coles", pointsMultiplier: 20 },
      parseFailed: false,
    });
    expect(reconcileOffers(records.map((record) => record.item)).results[0].outcome)
      .toBe("new-offer");
  });

  it("compares an approved baseline to the newest stored extraction", () => {
    const records = buildStoredOfferReconcileRecords(
      [raw([extraction({ pointsMultiplier: 30 })])],
      [candidate()],
    );
    expect(records).toHaveLength(1);
    expect(records[0].item.before?.pointsMultiplier).toBe(20);
    expect(records[0].item.after?.pointsMultiplier).toBe(30);
    expect(reconcileOffers(records.map((record) => record.item)).results[0].outcome)
      .toBe("changed-points-multiplier");
  });

  it("treats only an explicit removed snapshot as withdrawal", () => {
    const records = buildStoredOfferReconcileRecords(
      [raw([extraction({ sourcePresence: "removed" })])],
      [candidate()],
    );
    expect(records[0].item).toMatchObject({
      offerId: "offer-1",
      after: null,
      withdrawalStated: true,
    });
    expect(reconcileOffers(records.map((record) => record.item)).results[0].outcome)
      .toBe("withdrawn");
  });

  it("treats a missing reviewed child in a successfully parsed parent as unavailable, not withdrawn", () => {
    const records = buildStoredOfferReconcileRecords(
      [raw([extraction({ subOfferKey: "another-child" })])],
      [candidate()],
    );
    const reviewed = records.find((record) => record.item.offerId === "offer-1");
    expect(reviewed?.item).toMatchObject({
      after: null,
      withdrawalStated: false,
      parseFailed: false,
    });
    expect(reconcileOffers([reviewed!.item]).results[0].outcome).toBe(
      "source-unavailable",
    );
  });

  it("surfaces a failed stored parse without staging source unavailability", () => {
    const records = buildStoredOfferReconcileRecords(
      [raw([], { processing_status: "rejected", parser_error: "bad markup" })],
      [candidate()],
    );
    expect(records[0].item.parseFailed).toBe(true);
    expect(reconcileOffers(records.map((record) => record.item)).results[0].outcome)
      .toBe("parse-failure");
  });

  it("does not duplicate a candidate already staged from the same snapshot", () => {
    const records = buildStoredOfferReconcileRecords(
      [raw()],
      [
        candidate(),
        candidate({
          id: "candidate-open",
          review_status: "changed",
          approved_offer_id: null,
          created_at: "2026-07-15T01:00:00.000Z",
        }),
      ],
    );
    expect(records).toEqual([]);
  });

  it.each(["rejected", "archived"])(
    "does not recreate a %s terminal decision until the raw revision changes",
    (reviewStatus) => {
      const terminal = candidate({
        id: `candidate-${reviewStatus}`,
        review_status: reviewStatus,
        approved_offer_id: null,
        created_at: "2026-07-15T01:00:01.000Z",
      });
      expect(buildStoredOfferReconcileRecords([raw()], [terminal])).toEqual([]);

      const changedRaw = raw([extraction({ pointsMultiplier: 30 })], {
        updated_at: "2026-07-15T02:00:00.000Z",
      });
      expect(buildStoredOfferReconcileRecords([changedRaw], [terminal])).toHaveLength(1);
    },
  );

  it("isolates a failed raw item from a valid stored item", () => {
    const failed = raw([], {
      id: "raw-failed",
      processing_status: "rejected",
      parser_error: "parse failed",
    });
    const valid = raw([extraction({ subOfferKey: "tcn-woolworths" })], {
      id: "raw-valid",
      content_hash: "snapshot-valid",
    });
    const validCandidate = candidate({
      id: "candidate-valid",
      raw_item_id: "raw-valid",
      approved_offer_id: "offer-valid",
      terms_json: { subOfferKey: "tcn-woolworths" },
    });
    const failedCandidate = candidate({
      id: "candidate-failed",
      raw_item_id: "raw-failed",
      approved_offer_id: "offer-failed",
    });
    const records = buildStoredOfferReconcileRecords(
      [failed, valid],
      [failedCandidate, validCandidate],
    );
    expect(records.map((record) => record.item.offerId).sort()).toEqual([
      "offer-failed",
      "offer-valid",
    ]);
    expect(records.find((record) => record.item.offerId === "offer-failed")?.item.parseFailed)
      .toBe(true);
    expect(records.find((record) => record.item.offerId === "offer-valid")?.item.parseFailed)
      .toBe(false);
  });

  it("retains active/future canonical offers and permanently excludes archived lineage", () => {
    const rows = [
      raw([extraction()], { id: "raw-active" }),
      raw([extraction()], { id: "raw-future" }),
      raw([extraction()], { id: "raw-archived" }),
    ];
    const candidates = [
      candidate({ raw_item_id: "raw-active", approved_offer_id: "offer-active" }),
      candidate({ raw_item_id: "raw-future", approved_offer_id: "offer-future" }),
      candidate({ raw_item_id: "raw-archived", approved_offer_id: "offer-archived" }),
    ];
    const records = buildStoredOfferReconcileRecords(
      rows,
      candidates,
      new Set(["offer-active", "offer-future"]),
    );
    expect(records.map((record) => record.item.offerId).sort()).toEqual([
      "offer-active",
      "offer-future",
    ]);
  });
});

describe("stored gift-card reconciliation source gates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns no work when every source is intentionally closed", async () => {
    const sourceQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      not: vi.fn(),
      limit: vi.fn(async () => ({ data: [], error: null })),
    };
    sourceQuery.select.mockReturnValue(sourceQuery);
    sourceQuery.eq.mockReturnValue(sourceQuery);
    sourceQuery.not.mockReturnValue(sourceQuery);
    mocks.from.mockImplementation((table: string) => {
      if (table !== "gift_card_sources") {
        throw new Error(`Unexpected table read: ${table}`);
      }
      return sourceQuery;
    });
    await expect(loadStoredOfferReconcileRecords()).resolves.toEqual({
      available: true,
      records: [],
    });
    expect(sourceQuery.eq).toHaveBeenCalledWith("enabled", true);
    expect(sourceQuery.eq).toHaveBeenCalledWith("automated_fetch_allowed", true);
    expect(sourceQuery.not).toHaveBeenCalledWith("terms_checked_at", "is", null);
    expect(sourceQuery.not).toHaveBeenCalledWith("robots_checked_at", "is", null);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("fails closed when linked canonical lifecycle state is unavailable", async () => {
    const chain = (result: { data: unknown; error: unknown }) => {
      const query = {
        select: vi.fn(), eq: vi.fn(), not: vi.fn(), in: vi.fn(),
        order: vi.fn(), limit: vi.fn(),
        then: (resolve: (value: typeof result) => unknown) =>
          Promise.resolve(result).then(resolve),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.not.mockReturnValue(query);
      query.in.mockReturnValue(query);
      query.order.mockReturnValue(query);
      query.limit.mockReturnValue(query);
      return query;
    };
    const sourceQuery = chain({ data: [{ id: "gcdb" }], error: null });
    const rawQuery = chain({ data: [raw()], error: null });
    const candidateQuery = chain({ data: [candidate()], error: null });
    const offerQuery = chain({
      data: null,
      error: { code: "42703", message: "lifecycle_state does not exist" },
    });
    mocks.from.mockImplementation((table: string) => ({
      gift_card_sources: sourceQuery,
      gift_card_raw_items: rawQuery,
      gift_card_offer_candidates: candidateQuery,
      gift_card_offers: offerQuery,
    })[table]);

    await expect(loadStoredOfferReconcileRecords()).rejects.toBeInstanceOf(
      GiftCardLifecycleSchemaUnavailableError,
    );
    expect(offerQuery.in).toHaveBeenCalledWith("lifecycle_state", [
      "active",
      "approved-future",
    ]);
  });
});

describe("stored gift-card reconciliation apply adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const record = (): StoredOfferReconcileRecord => ({
    key: "raw-1:apple-coles",
    sourceId: "gcdb",
    rawItemId: "raw-1",
    subOfferKey: "apple-coles",
    snapshotHash: "snapshot-1",
    rawUpdatedAt: "2026-07-15T01:00:00.000Z",
    item: {
      offerId: "offer-1",
      before: extraction(),
      after: extraction({ pointsMultiplier: 30 }),
      canonicalExpiryDate: "2026-07-21",
      canonicalOngoing: false,
    },
  });

  function mockCandidateLookup(data: unknown, error: unknown = null) {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      contains: vi.fn(),
      gte: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data, error })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.contains.mockReturnValue(query);
    query.gte.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    return query;
  }

  it("stages and audits a private revision while leaving its canonical fixture unchanged", async () => {
    const lookup = mockCandidateLookup(null);
    const auditInsert = vi.fn(async () => ({ error: null }));
    mocks.from.mockImplementation((table: string) =>
      table === "gift_card_offer_candidates"
        ? lookup
        : { insert: auditInsert },
    );
    mocks.stageCandidate.mockResolvedValue(undefined);
    const stored = record();
    const canonicalBefore = structuredClone(stored.item.before);
    const [result] = reconcileOffers([stored.item]).results;

    await expect(
      stageStoredOfferReconcileResult(
        stored,
        result,
        new Date("2026-07-15T02:00:00.000Z"),
      ),
    ).resolves.toBe("staged");

    expect(mocks.stageCandidate).toHaveBeenCalledWith(
      "gcdb",
      expect.objectContaining({
        rawItemId: "raw-1",
        reviewStatus: "changed",
        changeKind: "material-offer",
        extraction: expect.objectContaining({ pointsMultiplier: 30 }),
        fieldDiff: expect.arrayContaining([
          expect.objectContaining({ field: "pointsMultiplier", before: 20, after: 30 }),
        ]),
      }),
    );
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "gift-card-reconcile-stage",
        row_id: "offer-1",
        diff: expect.objectContaining({ publicOfferMutated: false }),
      }),
    );
    expect(stored.item.before).toEqual(canonicalBefore);
    expect(mocks.from).not.toHaveBeenCalledWith("gift_card_offers");
  });

  it("is idempotent when an open candidate already covers the raw revision", async () => {
    mocks.from.mockReturnValue(mockCandidateLookup({ id: "candidate-open" }));
    const stored = record();
    const [result] = reconcileOffers([stored.item]).results;
    await expect(
      stageStoredOfferReconcileResult(stored, result, new Date()),
    ).resolves.toBe("already-staged");
    expect(mocks.stageCandidate).not.toHaveBeenCalled();
  });

  it("stages unavailability as a private source-presence review flag", async () => {
    const lookup = mockCandidateLookup(null);
    mocks.from.mockImplementation((table: string) =>
      table === "gift_card_offer_candidates"
        ? lookup
        : { insert: vi.fn(async () => ({ error: null })) },
    );
    mocks.stageCandidate.mockResolvedValue(undefined);
    const stored = record();
    stored.item.after = null;
    const [result] = reconcileOffers([stored.item]).results;
    expect(result.outcome).toBe("source-unavailable");
    await stageStoredOfferReconcileResult(stored, result, new Date());
    expect(mocks.stageCandidate).toHaveBeenCalledWith(
      "gcdb",
      expect.objectContaining({
        changeKind: "source-removed",
        reviewStatus: "changed",
        extraction: expect.objectContaining({ sourcePresence: "removed" }),
      }),
    );
  });

  it("fails closed when the candidate schema is unavailable", async () => {
    mocks.from.mockReturnValue(
      mockCandidateLookup(null, { code: "PGRST205", message: "not found" }),
    );
    const stored = record();
    const [result] = reconcileOffers([stored.item]).results;
    await expect(
      stageStoredOfferReconcileResult(stored, result, new Date()),
    ).resolves.toBe("schema-missing");
    expect(mocks.stageCandidate).not.toHaveBeenCalled();
  });
});
