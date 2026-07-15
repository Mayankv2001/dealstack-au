import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));

import { recordPredictionReconcileOutcome } from "@/lib/admin/repos/giftCardPredictions";

function predictionUpdate(data: unknown, error: unknown = null) {
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error })),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

describe("prediction reconciliation persistence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not write a still-pending prediction", async () => {
    await expect(
      recordPredictionReconcileOutcome(
        {
          predictionId: "prediction-1",
          outcome: "pending",
          linkedOfferId: null,
        },
        new Date("2026-07-15T00:00:00.000Z"),
      ),
    ).resolves.toBe("pending");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("updates only an unresolved private row and records an audit event", async () => {
    const update = predictionUpdate({ id: "prediction-1" });
    const auditInsert = vi.fn(async () => ({ error: null }));
    mocks.from.mockImplementation((table: string) =>
      table === "gift_card_offer_predictions" ? update : { insert: auditInsert },
    );
    await expect(
      recordPredictionReconcileOutcome(
        {
          predictionId: "prediction-1",
          outcome: "exact-match",
          linkedOfferId: "offer-1",
        },
        new Date("2026-07-15T00:00:00.000Z"),
      ),
    ).resolves.toBe("updated");
    const patch = update.update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch).some((key) => key.startsWith("predicted_"))).toBe(false);
    expect(patch).toMatchObject({
      status: "prediction_matched",
      linked_offer_id: "offer-1",
    });
    expect(update.eq).toHaveBeenCalledWith("status", "predicted");
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "gift-card-prediction-reconcile",
        table_name: "gift_card_offer_predictions",
        row_id: "prediction-1",
        diff: expect.objectContaining({ publicOfferMutated: false }),
      }),
    );
    expect(mocks.from).not.toHaveBeenCalledWith("gift_card_offers");
  });

  it("is idempotent after another run or reviewer resolves the row", async () => {
    mocks.from.mockReturnValue(predictionUpdate(null));
    await expect(
      recordPredictionReconcileOutcome(
        {
          predictionId: "prediction-1",
          outcome: "did-not-occur",
          linkedOfferId: null,
        },
        new Date(),
      ),
    ).resolves.toBe("already-reviewed");
  });

  it("persists a missed prediction without linking it to a public offer", async () => {
    const update = predictionUpdate({ id: "prediction-1" });
    mocks.from.mockImplementation((table: string) =>
      table === "gift_card_offer_predictions"
        ? update
        : { insert: vi.fn(async () => ({ error: null })) },
    );
    await expect(
      recordPredictionReconcileOutcome(
        {
          predictionId: "prediction-1",
          outcome: "did-not-occur",
          linkedOfferId: null,
        },
        new Date("2026-07-15T00:00:00.000Z"),
      ),
    ).resolves.toBe("updated");
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "prediction_missed",
        linked_offer_id: null,
      }),
    );
  });

  it("fails closed when migration 029 is absent", async () => {
    mocks.from.mockReturnValue(
      predictionUpdate(null, { code: "PGRST205", message: "missing" }),
    );
    await expect(
      recordPredictionReconcileOutcome(
        {
          predictionId: "prediction-1",
          outcome: "did-not-occur",
          linkedOfferId: null,
        },
        new Date(),
      ),
    ).resolves.toBe("schema-missing");
  });
});
