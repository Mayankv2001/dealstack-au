import { describe, expect, it, vi } from "vitest";
import { runGiftCardReconcile } from "@/lib/giftcards/runReconcile";
import type { DedupCandidate, PublishedOfferSummary } from "@/lib/giftcards/duplicateDetection";

const candidate: DedupCandidate = {
  sellerName: "Coles",
  giftCardBrands: ["Apple"],
  promotionType: "points",
  discountPercent: null,
  bonusPercent: null,
  pointsMultiplier: 20,
  fixedPoints: null,
  pointsProgram: "Flybuys",
  denominationNote: null,
  startsAt: "2026-07-10",
  expiresAt: "2026-07-20",
  sourceUrl: "https://example.com/campaign",
};

const published: PublishedOfferSummary = {
  id: "offer-1",
  brand: "Apple",
  seller: "Coles",
  promotionType: "points",
  discountPercent: null,
  bonusPercent: null,
  pointsMultiplier: 20,
  fixedPoints: null,
  pointsProgram: "Flybuys",
  denominationNote: null,
  startDate: "2026-07-10",
  expiryDate: "2026-07-20",
  sourceDetailUrl: "https://example.com/campaign",
};

describe("runGiftCardReconcile duplicate advisory integration", () => {
  it("counts flagged candidates and records advisory detail without auto-rejecting", async () => {
    const recordDuplicateAdvisory = vi.fn().mockResolvedValue(undefined);
    const metrics = await runGiftCardReconcile({
      now: () => new Date("2026-07-15T02:00:00Z"),
      loadItems: async () => [],
      loadPredictionInputs: async () => ({ predictions: [], confirmedOffers: [] }),
      loadAcceptanceInputs: async () => ({ current: [], candidates: [] }),
      stageChanged: vi.fn(),
      refresh: vi.fn(),
      markSourceUnavailable: vi.fn(),
      handleExpired: vi.fn(),
      recordPredictionOutcome: vi.fn(),
      recordAcceptanceOutcome: vi.fn(),
      loadDuplicateInputs: async () => ({
        newCandidates: [{ id: "candidate-1", candidate }],
        published: [published],
      }),
      recordDuplicateAdvisory,
    });

    expect(metrics.possibleDuplicates).toBe(1);
    expect(metrics.status).toBe("ok");
    expect(recordDuplicateAdvisory).toHaveBeenCalledWith(
      expect.objectContaining({ id: "candidate-1", outcome: "possible-duplicate" }),
    );
  });
});
