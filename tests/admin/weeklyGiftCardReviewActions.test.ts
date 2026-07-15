import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  rateLimit: vi.fn(),
  stageWeekly: vi.fn(),
  listCandidates: vi.fn(),
  listPublished: vi.fn(),
  attachEvidence: vi.fn(),
  setOfferPublished: vi.fn(),
  splitCandidate: vi.fn(),
  setCandidateStatus: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
  getPublishFacts: vi.fn(),
  approveCandidate: vi.fn(),
  getApprovalContext: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/rate-limit", () => ({
  checkAdminRateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/admin/repos/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/admin/repos/giftCards", () => ({ getGiftCardPublishFacts: mocks.getPublishFacts }));
vi.mock("@/lib/admin/repos/giftCardPipeline", () => ({
  approveGiftCardCandidate: mocks.approveCandidate,
  attachCandidateEvidenceToOffer: mocks.attachEvidence,
  getGiftCardCandidateApprovalContext: mocks.getApprovalContext,
  listGiftCardCandidates: mocks.listCandidates,
  listPublishedOfferSummaries: mocks.listPublished,
  setGiftCardOfferPublishedForReview: mocks.setOfferPublished,
  splitGiftCardCandidateForReview: mocks.splitCandidate,
  setCandidateStatus: mocks.setCandidateStatus,
  stageAdminAssistedWeeklyOffer: mocks.stageWeekly,
  recordWeeklySourceRestriction: vi.fn(),
}));

import {
  attachDuplicateEvidence,
  markCandidateSourceUnavailable,
  markCandidateWithdrawn,
  setLinkedOfferPublished,
  splitCandidateRevision,
  submitWeeklyCandidate,
  approveCandidate,
} from "@/app/admin/(protected)/gift-cards/review/actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ email: "admin@dealstack.test" });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.setCandidateStatus.mockResolvedValue(undefined);
  mocks.setOfferPublished.mockResolvedValue(undefined);
  mocks.splitCandidate.mockResolvedValue(["child-a", "child-b"]);
  mocks.getPublishFacts.mockResolvedValue({
    brand: "Apple",
    seller: "Woolworths",
    sourceUrl: "https://example.test/source",
    promotionType: "points",
    discountPercent: null,
    bonusPercent: null,
    pointsMultiplier: 20,
    pointsProgram: "Everyday Rewards",
    fixedDiscountDollars: null,
    promoCreditDollars: null,
    thresholdDollars: null,
    membershipRequired: false,
    expiryDate: "2026-07-21",
    isOngoing: false,
  });
  mocks.getApprovalContext.mockResolvedValue({
    approvedOfferId: "gc-existing",
    sourceName: "GCDB",
    sourceUrl: "https://gcdb.example/offers/1",
    sourceText: "10% off Apple gift cards at Coles",
    subOfferKey: "primary",
    candidateRole: "single-offer",
    parentIsCompound: false,
    sourcePresence: "present",
  });
  mocks.listPublished.mockResolvedValue([]);
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

  it("records source-unavailable without changing the linked public offer", async () => {
    mocks.listCandidates.mockResolvedValue([{ id: "candidate-1", approvedOfferId: "offer-1" }]);
    expect(await markCandidateSourceUnavailable("candidate-1")).toEqual({});
    expect(mocks.setOfferPublished).not.toHaveBeenCalled();
    expect(mocks.setCandidateStatus).toHaveBeenCalledWith(
      "candidate-1",
      "archived",
      "admin@dealstack.test",
      "Source unavailable; no withdrawal inferred",
    );
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mark-gift-card-source-unavailable",
        diff: expect.objectContaining({ publicOfferChanged: false }),
      }),
    );
  });

  it("unpublishes only an explicitly withdrawn linked offer and audits it", async () => {
    mocks.listCandidates.mockResolvedValue([{ id: "candidate-1", approvedOfferId: "offer-1" }]);
    expect(await markCandidateWithdrawn("candidate-1")).toEqual({});
    expect(mocks.setOfferPublished).toHaveBeenCalledWith("offer-1", false);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "withdraw-gift-card-offer-from-revision", rowId: "offer-1" }),
    );
  });

  it("revalidates publish readiness before restoring a linked offer", async () => {
    mocks.listCandidates.mockResolvedValue([{ id: "candidate-1", approvedOfferId: "offer-1" }]);
    expect(await setLinkedOfferPublished("candidate-1", true)).toEqual({});
    expect(mocks.getPublishFacts).toHaveBeenCalledWith("offer-1");
    expect(mocks.setOfferPublished).toHaveBeenCalledWith("offer-1", true);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "restore-gift-card-offer-from-revision" }),
    );
  });

  it("splits only reviewed atomic definitions and audits the child identities", async () => {
    const form = new FormData();
    form.set("split_definitions", JSON.stringify([
      { subOfferKey: "apple-credit", brand: "Apple", promotionType: "promo-credit", promoCreditDollars: 10, thresholdDollars: 100 },
      { subOfferKey: "uber-discount", brand: "Uber", promotionType: "discount", discountPercent: 10 },
    ]));
    expect(await splitCandidateRevision("candidate-1", {}, form)).toEqual({});
    expect(mocks.splitCandidate).toHaveBeenCalledWith(
      "candidate-1",
      expect.arrayContaining([expect.objectContaining({ subOfferKey: "apple-credit" })]),
      "admin@dealstack.test",
    );
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "split-gift-card-revision-candidate" }),
    );
  });

  it("updates the candidate-linked offer id and rejects a different submitted id", async () => {
    const form = new FormData();
    Object.entries({
      brand: "Apple",
      seller: "Coles",
      promotion_type: "discount",
      channel: "supermarket-promo",
      format: "digital-and-physical",
      discount_percent: "10",
      reward_destination: "checkout-discount",
      start_date: "2026-07-15",
      expiry_date: "2026-07-21",
      offer_id: "gc-existing",
    }).forEach(([key, value]) => form.set(key, value));
    expect(await approveCandidate("candidate-1", {}, form)).toEqual({});
    expect(mocks.approveCandidate).toHaveBeenCalledWith(
      "candidate-1",
      "gc-existing",
      expect.objectContaining({ confidence: "confirmed" }),
      "admin@dealstack.test",
    );

    form.set("offer_id", "gc-unrelated");
    const rejected = await approveCandidate("candidate-1", {}, form);
    expect(rejected.error).toMatch(/linked to gc-existing/i);
    expect(mocks.approveCandidate).toHaveBeenCalledTimes(1);
  });

  it("does not let a new candidate claim an existing public offer ID", async () => {
    mocks.getApprovalContext.mockResolvedValue({
      approvedOfferId: null,
      sourceName: "GCDB",
      sourceUrl: "https://gcdb.example/offers/2",
      sourceText: "10% off Apple gift cards at Coles",
      subOfferKey: "primary",
      candidateRole: "single-offer",
      parentIsCompound: false,
      sourcePresence: "present",
    });
    mocks.listPublished.mockResolvedValue([{ id: "gc-existing" }]);
    const form = new FormData();
    Object.entries({
      brand: "Apple",
      seller: "Coles",
      promotion_type: "discount",
      channel: "supermarket-promo",
      format: "digital-and-physical",
      discount_percent: "10",
      reward_destination: "checkout-discount",
      start_date: "2026-07-15",
      expiry_date: "2026-07-21",
      offer_id: "gc-existing",
    }).forEach(([key, value]) => form.set(key, value));

    const result = await approveCandidate("candidate-new", {}, form);
    expect(result.error).toMatch(/already belongs to an existing offer/i);
    expect(mocks.approveCandidate).not.toHaveBeenCalled();
  });
});
