import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  checkRate: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/rate-limit", () => ({
  checkAdminRateLimit: mocks.checkRate,
}));
vi.mock("@/lib/admin/repos/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/admin/repos/giftCardPredictions", () => ({
  updatePredictionReview: mocks.update,
  upsertPredictions: mocks.upsert,
}));

import {
  capturePredictionSnapshot,
  recordPredictionReview,
} from "@/app/admin/(protected)/gift-cards/predictions/actions";

const fixture = readFileSync(
  new URL("../fixtures/gcdb-predictions.html", import.meta.url),
  "utf8",
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ email: "admin@dealstack.test" });
  mocks.checkRate.mockResolvedValue({ success: true });
  mocks.update.mockResolvedValue(undefined);
  mocks.upsert.mockResolvedValue({ available: true, inserted: 9, preserved: 0 });
  mocks.audit.mockResolvedValue(undefined);
});

describe("gift-card prediction snapshot capture", () => {
  it("requires an authenticated admin before rate limiting or parsing", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("unauthorised"));
    const form = new FormData();
    form.set("snapshot_html", fixture);
    await expect(capturePredictionSnapshot({}, form)).rejects.toThrow("unauthorised");
    expect(mocks.checkRate).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("parses a pasted fixture into the private repo and audits without retaining HTML", async () => {
    const form = new FormData();
    form.set("snapshot_html", fixture);
    await expect(capturePredictionSnapshot({}, form)).resolves.toEqual({
      success: "9 private prediction records staged; 0 existing records preserved.",
    });
    expect(mocks.checkRate).toHaveBeenCalledWith({
      adminEmail: "admin@dealstack.test",
      actionKey: "gift_card_prediction_capture",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          predictedSeller: "Coles",
          rawMarker: "✅",
        }),
      ]),
      {
        sourceUrl: "https://gcdb.com.au/predictions/",
        sourceLastUpdated: "2026-07-10",
      },
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "capture-gift-card-predictions",
        tableName: "gift_card_offer_predictions",
        forceExplicit: true,
        diff: expect.objectContaining({
          networkFetch: false,
          publicOfferMutated: false,
          inserted: 9,
        }),
      }),
    );
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("<table");
  });

  it("accepts one captured HTML upload without a pasted duplicate", async () => {
    const form = new FormData();
    form.set(
      "snapshot_file",
      new File([fixture], "gcdb-predictions.html", { type: "text/html" }),
    );
    await expect(capturePredictionSnapshot({}, form)).resolves.toEqual({
      success: "9 private prediction records staged; 0 existing records preserved.",
    });
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("rejects ambiguous paste-plus-upload input before staging", async () => {
    const form = new FormData();
    form.set("snapshot_html", fixture);
    form.set(
      "snapshot_file",
      new File([fixture], "gcdb-predictions.html", { type: "text/html" }),
    );
    await expect(capturePredictionSnapshot({}, form)).resolves.toEqual({
      error: "Paste a snapshot or upload one file, not both.",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rate-limits before parsing or staging", async () => {
    mocks.checkRate.mockResolvedValue({ success: false, error: "Slow down" });
    const form = new FormData();
    form.set("snapshot_html", fixture);
    await expect(capturePredictionSnapshot({}, form)).resolves.toEqual({ error: "Slow down" });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("returns a controlled response when migration 029 is missing", async () => {
    mocks.upsert.mockResolvedValue({ available: false, inserted: 0, preserved: 0 });
    const form = new FormData();
    form.set("snapshot_html", fixture);
    await expect(capturePredictionSnapshot({}, form)).resolves.toEqual({
      error: "Migration 029 is not available. No prediction records were staged.",
    });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("reports an idempotent exact re-capture", async () => {
    mocks.upsert.mockResolvedValue({ available: true, inserted: 0, preserved: 9 });
    const form = new FormData();
    form.set("snapshot_html", fixture);
    await expect(capturePredictionSnapshot({}, form)).resolves.toEqual({
      success: "0 private prediction records staged; 9 existing records preserved.",
    });
  });
});

describe("gift-card prediction review actions", () => {
  it("requires a confirmed offer for matched outcomes", async () => {
    const form = new FormData();
    form.set("status", "prediction_matched");
    const result = await recordPredictionReview("prediction-1", {}, form);
    expect(result.error).toMatch(/require a confirmed offer link/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("forbids an offer link on a missed prediction", async () => {
    const form = new FormData();
    form.set("status", "prediction_missed");
    form.set("linked_offer_id", "gc-offer");
    const result = await recordPredictionReview("prediction-1", {}, form);
    expect(result.error).toMatch(/cannot link/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("records and audits a valid private outcome without a publish action", async () => {
    const form = new FormData();
    form.set("status", "prediction_partially_matched");
    form.set("linked_offer_id", "gc-offer");
    form.set("comparison_notes", "Seller matched; value differed.");
    expect(await recordPredictionReview("prediction-1", {}, form)).toEqual({
      success: "Prediction outcome recorded. No public offer was changed.",
    });
    expect(mocks.update).toHaveBeenCalledWith("prediction-1", {
      status: "prediction_partially_matched",
      linkedOfferId: "gc-offer",
      comparisonNotes: "Seller matched; value differed.",
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "record-gift-card-prediction-outcome",
        rowId: "prediction-1",
      }),
    );
  });
});
