import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedPrediction } from "@/lib/giftcards/parsePredictions";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));

import { upsertPredictions } from "@/lib/admin/repos/giftCardPredictions";
import {
  buildPredictionFingerprint,
  GCDB_PREDICTIONS_URL,
} from "@/lib/giftcards/parsePredictions";

const prediction: ParsedPrediction = {
  predictedSeller: "Coles",
  predictedPromotionText: "Bonus 10% on Myer gift cards",
  predictedPromotionType: "bonus-value",
  predictedFamilies: ["Myer"],
  predictedValue: "Bonus 10%",
  predictedDiscountPercent: 10,
  predictedStartsAt: "2026-07-15",
  predictedEndsAt: "2026-07-21",
  refUrl: "https://gcdb.com.au/offer/7407/",
  rawMarker: "✅",
  fingerprint: buildPredictionFingerprint(
    "Coles",
    ["Myer"],
    "2026-07-15",
    "2026-07-21",
  ),
};

function upsertQuery(data: unknown, error: unknown = null) {
  const query = {
    upsert: vi.fn(),
    select: vi.fn(async () => ({ data, error })),
  };
  query.upsert.mockReturnValue(query);
  return query;
}

describe("private prediction capture persistence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the DB-enforced source/fingerprint key and stores markers uninterpreted", async () => {
    const query = upsertQuery([{ fingerprint: prediction.fingerprint }]);
    mocks.from.mockReturnValue(query);
    await expect(
      upsertPredictions([prediction], {
        sourceUrl: GCDB_PREDICTIONS_URL,
        sourceLastUpdated: "2026-07-10",
      }),
    ).resolves.toEqual({ available: true, inserted: 1, preserved: 0 });
    expect(query.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({
        source_id: "gcdb_predictions",
        source_url: GCDB_PREDICTIONS_URL,
        predicted_families: ["Myer"],
        predicted_promotion_text: prediction.predictedPromotionText,
        source_reference_url: prediction.refUrl,
        source_marker: "✅",
        status: "predicted",
      })],
      { onConflict: "source_id,fingerprint", ignoreDuplicates: true },
    );
    const row = query.upsert.mock.calls[0][0][0];
    expect(row).not.toHaveProperty("fingerprint");
    expect(row).not.toHaveProperty("comparison_notes");
    expect(mocks.from).toHaveBeenCalledWith("gift_card_offer_predictions");
    expect(mocks.from).not.toHaveBeenCalledWith("gift_card_offers");
  });

  it("preserves an exact re-capture without issuing an update", async () => {
    const query = upsertQuery([]);
    mocks.from.mockReturnValue(query);
    await expect(
      upsertPredictions([prediction], {
        sourceUrl: GCDB_PREDICTIONS_URL,
        sourceLastUpdated: "2026-07-10",
      }),
    ).resolves.toEqual({ available: true, inserted: 0, preserved: 1 });
    expect(query.upsert).toHaveBeenCalledOnce();
    expect(query).not.toHaveProperty("update");
  });

  it("returns a controlled missing-schema result", async () => {
    mocks.from.mockReturnValue(
      upsertQuery(null, { code: "PGRST205", message: "table missing" }),
    );
    await expect(
      upsertPredictions([prediction], {
        sourceUrl: GCDB_PREDICTIONS_URL,
        sourceLastUpdated: null,
      }),
    ).resolves.toEqual({ available: false, inserted: 0, preserved: 0 });
  });
});
