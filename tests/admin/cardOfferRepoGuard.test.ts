import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

import {
  insertCardOffer,
  updateCardOffer,
  type CardOfferInput,
} from "@/lib/admin/repos/cardOffers";

const INVALID_PUBLISHED_OFFER: CardOfferInput = {
  provider: "Example Bank",
  cardName: "Rewards Platinum",
  offerType: "sign_up_bonus",
  bonusPoints: null,
  cashbackAmount: null,
  statementCreditAmount: null,
  minimumSpend: null,
  minimumSpendPeriod: null,
  annualFee: null,
  bonusStages: [],
  pointValueCents: null,
  eligibilityNotes: "Check the issuer's current criteria.",
  offerSummary: "Illustrative offer",
  sourceUrl: "http://issuer.example/card",
  confidence: "needs-verification",
  expiryDate: null,
  reviewByDate: "2026-07-09",
  isPublished: true,
};

beforeEach(() => {
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockImplementation(() => {
    throw new Error("The publication guard should return before opening the database.");
  });
});

describe("card-offer repository publish guard", () => {
  it("rejects a non-ready published insert before opening a database client", async () => {
    const result = await insertCardOffer(INVALID_PUBLISHED_OFFER);

    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("Expected the published insert to be rejected.");
    expect(result.error).toContain("Cannot publish:");
    expect(result.error).toContain("confidence must be Confirmed");
    expect(result.error).toContain("review-by date has passed");
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("rejects a non-ready published update before opening a database client", async () => {
    const result = await updateCardOffer("card-1", INVALID_PUBLISHED_OFFER);

    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error("Expected the published update to be rejected.");
    expect(result.error).toContain("valid HTTPS URL");
    expect(result.error).toContain("remove placeholder wording (illustrative)");
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});
