import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  rateLimit: vi.fn(),
  stageWeekly: vi.fn(),
  listCandidates: vi.fn(),
  listPublished: vi.fn(),
  attachEvidence: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/rate-limit", () => ({
  checkAdminRateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/admin/repos/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/admin/repos/giftCardPipeline", () => ({
  approveGiftCardCandidate: vi.fn(),
  attachCandidateEvidenceToOffer: mocks.attachEvidence,
  getGiftCardCandidateApprovalContext: vi.fn(),
  listGiftCardCandidates: mocks.listCandidates,
  listPublishedOfferSummaries: mocks.listPublished,
  setCandidateStatus: vi.fn(),
  stageAdminAssistedWeeklyOffer: mocks.stageWeekly,
  recordWeeklySourceRestriction: vi.fn(),
}));

import {
  attachDuplicateEvidence,
  submitWeeklyCandidate,
} from "@/app/admin/(protected)/gift-cards/review/actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ email: "admin@dealstack.test" });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.logAudit.mockResolvedValue(undefined);
});

describe("weekly gift-card review actions", () => {
  it("stages structured admin facts privately and records an audit", async () => {
    mocks.stageWeekly.mockResolvedValue("new");
    const form = new FormData();
    Object.entries({
      seller: "Coles",
      discoverySourceUrl:
        "https://www.pointhacks.com.au/weekly-gift-card-offers/",
      startDate: "2026-07-15",
      endDate: "2026-07-21",
      giftCardBrands: "Myer",
      promotionType: "bonus-value",
      bonusPercent: "10",
      loyaltyProgramme: "Flybuys",
    }).forEach(([key, value]) => form.set(key, value));

    const result = await submitWeeklyCandidate({}, form);
    expect(result.success).toMatch(/staged/i);
    expect(mocks.stageWeekly).toHaveBeenCalledWith(
      expect.objectContaining({
        seller: "Coles",
        giftCardBrands: ["Myer"],
        bonusPercent: 10,
      }),
    );
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "submit-weekly-gift-card-candidate" }),
    );
    // The action stages a candidate only; it has no publication dependency.
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/admin/gift-cards/review",
    );
  });

  it("attaches a second source as evidence to a canonical offer instead of publishing a duplicate", async () => {
    mocks.listCandidates.mockResolvedValue([
      {
        id: "candidate-1",
        sellerName: "Woolworths",
        giftCardBrands: ["Apple"],
        promotionType: "points",
        discountPercent: null,
        bonusPercent: null,
        pointsMultiplier: 20,
        fixedPoints: null,
        pointsProgram: "Everyday Rewards",
        startsAt: "2026-07-15",
        expiresAt: "2026-07-21",
        sourceUrl: "https://www.pointhacks.com.au/weekly-gift-card-offers/",
        terms: { weeklyFacts: { denominations: [100], variableLoadRange: null } },
      },
    ]);
    mocks.listPublished.mockResolvedValue([
      {
        id: "gc-apple-weekly",
        brand: "Apple",
        seller: "Woolworths",
        promotionType: "points",
        discountPercent: null,
        bonusPercent: null,
        pointsMultiplier: 20,
        fixedPoints: null,
        pointsProgram: "Everyday Rewards",
        denominationNote: "$100",
        startDate: "2026-07-15",
        expiryDate: "2026-07-21",
        sourceDetailUrl: "https://www.woolworths.com.au/shop/catalogue",
      },
    ]);

    const result = await attachDuplicateEvidence(
      "candidate-1",
      "gc-apple-weekly",
      {},
      new FormData(),
    );
    expect(result).toEqual({});
    expect(mocks.attachEvidence).toHaveBeenCalledWith(
      "candidate-1",
      "gc-apple-weekly",
      "admin@dealstack.test",
    );
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "attach-gift-card-candidate-evidence",
        rowId: "gc-apple-weekly",
      }),
    );
  });
});
