import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractedOffer } from "@/lib/giftcards/extractOffer";
import type { ReconcileResult } from "@/lib/giftcards/reconcileOffers";
import type { ReconcileDataBoundaries } from "@/lib/admin/repos/giftCardReconcileData";
import type { StoredOfferReconcileRecord } from "@/lib/admin/repos/giftCardReconcileStore";

/**
 * Gate-ordering + orchestration guarantees for the gift-card reconcile cron.
 * Every gate fails closed; `?force=1` never bypasses auth, the env flag, or the
 * once-per-day interval guard (there is no run-hour gate to bypass). Proven by
 * asserting startReconcileRun (the lock acquire) is never reached when a gate is
 * closed. runGuardedIngest is the real implementation; only env + repo
 * boundaries are mocked.
 */

const mocks = vi.hoisted(() => ({
  cronSecret: vi.fn(),
  giftCardReconcileEnabled: vi.fn(),
  giftCardReconcileMinIntervalHours: vi.fn(() => 20),
  startReconcileRun: vi.fn(),
  lastReconcileRunStart: vi.fn(),
  finishIngestRun: vi.fn(),
  failIngestRun: vi.fn(),
  loadReconcileInputs: vi.fn(),
  reportOperationalError: vi.fn(),
  applyLifecycle: vi.fn(),
  lifecycleSchemaUnavailable: vi.fn(),
  revalidatePath: vi.fn(),
  jobRunSchemaUnavailable: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  cronSecret: mocks.cronSecret,
  giftCardReconcileEnabled: mocks.giftCardReconcileEnabled,
  giftCardReconcileMinIntervalHours: mocks.giftCardReconcileMinIntervalHours,
}));
vi.mock("@/lib/admin/repos/giftCardReconcileRuns", () => ({
  startReconcileRun: mocks.startReconcileRun,
  lastReconcileRunStart: mocks.lastReconcileRunStart,
}));
vi.mock("@/lib/admin/repos/giftCardPipeline", () => ({
  finishIngestRun: mocks.finishIngestRun,
  failIngestRun: mocks.failIngestRun,
}));
vi.mock("@/lib/admin/repos/giftCardReconcileData", () => ({
  loadReconcileInputs: mocks.loadReconcileInputs,
}));
vi.mock("@/lib/observability/report-server-error", () => ({
  reportOperationalError: mocks.reportOperationalError,
}));
vi.mock("@/lib/admin/repos/giftCardLifecycle", () => ({
  applyGiftCardLifecycle: mocks.applyLifecycle,
  isGiftCardLifecycleSchemaUnavailable: mocks.lifecycleSchemaUnavailable,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/repos/giftCardJobRunErrors", () => ({
  isGiftCardJobRunSchemaUnavailable: mocks.jobRunSchemaUnavailable,
}));

import { GET } from "@/app/api/cron/gift-card-reconcile/route";

const request = (bearer = "s3cret", force = false) =>
  new Request(`https://d.test/api/cron/gift-card-reconcile${force ? "?force=1" : ""}`, {
    headers: { authorization: `Bearer ${bearer}` },
  });

const emptyInputs = {
  items: [],
  predictionInputs: { predictions: [], confirmedOffers: [] },
  acceptanceInputs: { current: [], candidates: [] },
  apply: {
    stageChanged: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    markSourceUnavailable: vi.fn(async () => {}),
    handleExpired: vi.fn(async () => {}),
    recordPredictionOutcome: vi.fn(async () => {}),
    recordAcceptanceOutcome: vi.fn(async () => {}),
  },
};

const expiredExtraction: ExtractedOffer = {
  subOfferKey: "expired",
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
  startsAt: "2026-07-01",
  expiresAt: "2026-07-10",
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
};

const lifecycleSuccess = {
  sydneyDate: "2026-07-15",
  activatedOfferIds: [],
  archivedOfferIds: ["offer-1", "offer-2"],
  historySealedOfferIds: ["offer-1", "offer-2"],
  affectedStoreIds: ["jb-hifi"],
  errors: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cronSecret.mockReturnValue("s3cret");
  mocks.giftCardReconcileEnabled.mockReturnValue(true);
  mocks.giftCardReconcileMinIntervalHours.mockReturnValue(20);
  mocks.lastReconcileRunStart.mockResolvedValue(null);
  mocks.startReconcileRun.mockResolvedValue({ started: true, runId: "run-1" });
  mocks.finishIngestRun.mockResolvedValue(undefined);
  mocks.loadReconcileInputs.mockResolvedValue(emptyInputs);
  mocks.applyLifecycle.mockResolvedValue(lifecycleSuccess);
  mocks.lifecycleSchemaUnavailable.mockReturnValue(false);
  mocks.jobRunSchemaUnavailable.mockReturnValue(false);
});

afterEach(() => vi.useRealTimers());

describe("gift-card reconcile route — gates and orchestration", () => {
  it("returns 503 when the cron secret is unset", async () => {
    mocks.cronSecret.mockReturnValue(null);
    expect((await GET(request())).status).toBe(503);
    expect(mocks.startReconcileRun).not.toHaveBeenCalled();
  });

  it("returns 401 on a wrong bearer, before any DB access", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(mocks.lastReconcileRunStart).not.toHaveBeenCalled();
    expect(mocks.startReconcileRun).not.toHaveBeenCalled();
  });

  it("returns a quiet controlled 503 when migration 030 is unavailable", async () => {
    const error = new Error("migration 030 missing");
    mocks.lastReconcileRunStart.mockRejectedValue(error);
    mocks.jobRunSchemaUnavailable.mockImplementation((value) => value === error);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      ran: false,
      skipped: "schema-unavailable",
    });
    expect(mocks.startReconcileRun).not.toHaveBeenCalled();
    expect(mocks.reportOperationalError).not.toHaveBeenCalled();
  });

  it("no-ops when the env flag is off (no DB access), even with ?force=1", async () => {
    mocks.giftCardReconcileEnabled.mockReturnValue(false);
    const res = await GET(request("s3cret", true));
    expect(await res.json()).toMatchObject({ ran: false, skipped: "environment-disabled" });
    expect(mocks.lastReconcileRunStart).not.toHaveBeenCalled();
    expect(mocks.startReconcileRun).not.toHaveBeenCalled();
  });

  it("interval guard blocks a run <20h since the last; ?force=1 does NOT bypass it", async () => {
    mocks.lastReconcileRunStart.mockResolvedValue(new Date(Date.now() - 5 * 3_600_000));
    const res = await GET(request("s3cret", true));
    expect(await res.json()).toMatchObject({ ran: false, skipped: "interval-guard" });
    expect(mocks.startReconcileRun).not.toHaveBeenCalled();
  });

  it("returns a skip when its source/kind slot or mutation fence is held", async () => {
    mocks.startReconcileRun.mockResolvedValue({ started: false, reason: "already-running" });
    const res = await GET(request());
    expect(await res.json()).toMatchObject({ ran: false, skipped: "already-running" });
    expect(mocks.finishIngestRun).not.toHaveBeenCalled();
  });

  it("runs, finalises the ledger, and returns a structured reconcile result", async () => {
    const res = await GET(request());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      ran: true,
      runId: "run-1",
      runKind: "reconcile",
      status: "ok",
      total: 0,
    });
    expect(body).toHaveProperty("changedCandidates");
    expect(body).toHaveProperty("predictionsProcessed");
    expect(body).toHaveProperty("acceptance");
    expect(mocks.finishIngestRun).toHaveBeenCalledOnce();
  });

  it.each([1, 2])(
    "fans %i expired outcomes into one fixed-clock lifecycle call and revalidates",
    async (count) => {
      vi.useFakeTimers();
      const capturedNow = new Date("2026-07-15T02:03:04.000Z");
      vi.setSystemTime(capturedNow);
      mocks.loadReconcileInputs.mockImplementation(async (boundaries: ReconcileDataBoundaries) => {
        const items = Array.from({ length: count }, (_, index) => ({
          offerId: `offer-${index + 1}`,
          before: { ...expiredExtraction, subOfferKey: `expired-${index + 1}` },
          after: { ...expiredExtraction, subOfferKey: `expired-${index + 1}` },
          canonicalExpiryDate: "2026-07-10",
          canonicalOngoing: false,
        }));
        return {
          ...emptyInputs,
          items,
          apply: {
            ...emptyInputs.apply,
            handleExpired: async (result: ReconcileResult) => {
              await boundaries.archiveConfirmedExpired!(
                { key: result.offerId, item: { offerId: result.offerId } } as StoredOfferReconcileRecord,
                result,
                boundaries.now!,
              );
            },
          },
        };
      });

      const response = await GET(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ran: true,
        status: "ok",
        expired: count,
      });
      expect(mocks.loadReconcileInputs).toHaveBeenCalledWith(
        expect.objectContaining({ now: capturedNow }),
      );
      expect(mocks.applyLifecycle).toHaveBeenCalledOnce();
      expect(mocks.applyLifecycle).toHaveBeenCalledWith(capturedNow);
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/gift-cards");
      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/gift-cards/[id]",
        "page",
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/stores/jb-hifi");
    },
  );

  it("isolates and reports lifecycle partial errors without staging removal", async () => {
    mocks.applyLifecycle.mockResolvedValue({
      ...lifecycleSuccess,
      archivedOfferIds: [],
      historySealedOfferIds: [],
      errors: [{ offerId: "offer-1", step: "archive", error: "history invalid" }],
    });
    mocks.loadReconcileInputs.mockImplementation(async (boundaries: ReconcileDataBoundaries) => ({
      ...emptyInputs,
      items: [{
        offerId: "offer-1",
        before: expiredExtraction,
        after: expiredExtraction,
        canonicalExpiryDate: "2026-07-10",
      }],
      apply: {
        ...emptyInputs.apply,
        handleExpired: async (result: ReconcileResult) => {
          await boundaries.archiveConfirmedExpired!(
            {} as StoredOfferReconcileRecord,
            result,
            boundaries.now!,
          );
        },
      },
    }));

    const response = await GET(request());
    expect(await response.json()).toMatchObject({
      ran: true,
      status: "partial",
      errorCount: 1,
    });
    expect(emptyInputs.apply.stageChanged).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.finishIngestRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "partial" }),
      1,
      expect.any(Date),
    );
  });

  it("keeps source disappearance in private review and never invokes lifecycle", async () => {
    mocks.loadReconcileInputs.mockResolvedValue({
      ...emptyInputs,
      items: [{
        offerId: "offer-1",
        before: { ...expiredExtraction, expiresAt: "2026-07-30" },
        after: null,
        canonicalExpiryDate: "2026-07-30",
        canonicalOngoing: false,
        withdrawalStated: false,
      }],
    });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({
      ran: true,
      sourceUnavailable: 1,
      expired: 0,
    });
    expect(emptyInputs.apply.markSourceUnavailable).toHaveBeenCalledOnce();
    expect(mocks.applyLifecycle).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("isolates a transient lifecycle failure as an observable partial run", async () => {
    mocks.applyLifecycle.mockRejectedValue(new Error("lifecycle transient"));
    mocks.loadReconcileInputs.mockImplementation(async (boundaries: ReconcileDataBoundaries) => ({
      ...emptyInputs,
      items: [{
        offerId: "offer-1",
        before: expiredExtraction,
        after: expiredExtraction,
        canonicalExpiryDate: "2026-07-10",
      }],
      apply: {
        ...emptyInputs.apply,
        handleExpired: async (result: ReconcileResult) => {
          await boundaries.archiveConfirmedExpired!(
            {} as StoredOfferReconcileRecord,
            result,
            boundaries.now!,
          );
        },
      },
    }));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ran: true,
      status: "partial",
      errorCount: 1,
    });
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      "gift-card-reconcile",
      expect.stringContaining("lifecycle transient"),
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns controlled schema-unavailable when the lazy lifecycle RPC is absent", async () => {
    const error = new Error("migration 032 missing");
    mocks.lifecycleSchemaUnavailable.mockImplementation((value) => value === error);
    mocks.applyLifecycle.mockRejectedValue(error);
    mocks.loadReconcileInputs.mockImplementation(async (boundaries: ReconcileDataBoundaries) => ({
      ...emptyInputs,
      items: [{
        offerId: "offer-1",
        before: expiredExtraction,
        after: expiredExtraction,
        canonicalExpiryDate: "2026-07-10",
      }],
      apply: {
        ...emptyInputs.apply,
        handleExpired: async (result: ReconcileResult) => {
          await boundaries.archiveConfirmedExpired!(
            {} as StoredOfferReconcileRecord,
            result,
            boundaries.now!,
          );
        },
      },
    }));

    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      ran: false,
      skipped: "schema-unavailable",
    });
    expect(mocks.failIngestRun).toHaveBeenCalledOnce();
    expect(mocks.reportOperationalError).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns controlled schema-unavailable when canonical lifecycle loading is absent", async () => {
    const error = new Error("lifecycle_state missing");
    mocks.lifecycleSchemaUnavailable.mockImplementation((value) => value === error);
    mocks.loadReconcileInputs.mockRejectedValue(error);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ran: false,
      skipped: "schema-unavailable",
    });
    expect(mocks.applyLifecycle).not.toHaveBeenCalled();
    expect(mocks.reportOperationalError).not.toHaveBeenCalled();
  });
});
