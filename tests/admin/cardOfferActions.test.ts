import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  checkRateLimit: vi.fn(),
  logAudit: vi.fn(),
  insertCardOffer: vi.fn(),
  setCardOfferPublished: vi.fn(),
  updateCardOffer: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/rate-limit", () => ({
  checkAdminRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/admin/repos/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/admin/repos/cardOffers", () => ({
  CONFIDENCE_LEVELS: ["confirmed", "needs-verification", "expired-unknown"],
  OFFER_TYPES: [
    "sign_up_bonus",
    "cashback",
    "statement_credit",
    "points_bonus",
    "annual_fee_discount",
  ],
  insertCardOffer: mocks.insertCardOffer,
  setCardOfferPublished: mocks.setCardOfferPublished,
  updateCardOffer: mocks.updateCardOffer,
}));

import {
  createCardOffer,
  setPublished,
  updateCardOffer,
} from "@/app/admin/(protected)/card-offers/actions";

function offerForm(
  overrides: Record<string, string | boolean | undefined> = {}
): FormData {
  const values: Record<string, string | boolean | undefined> = {
    provider: "Example Bank",
    card_name: "Rewards Platinum",
    offer_type: "sign_up_bonus",
    bonus_points: "80000",
    cashback_amount: "",
    statement_credit_amount: "",
    minimum_spend: "3000",
    minimum_spend_period: "90 days",
    annual_fee: "249",
    eligibility_notes: "New primary cardholders who meet the issuer's criteria.",
    offer_summary: "Earn bonus points after meeting the minimum spend.",
    source_url: "https://issuer.example/cards/rewards-platinum",
    confidence: "confirmed",
    expiry_date: "2999-12-31",
    is_published: false,
    ...overrides,
  };
  const formData = new FormData();

  for (const [name, value] of Object.entries(values)) {
    if (value === true) formData.set(name, "on");
    else if (typeof value === "string") formData.set(name, value);
  }
  return formData;
}

const PUBLISH_ERROR =
  "Cannot publish: confidence must be Confirmed; expiry date is required; " +
  "source URL must be a valid HTTPS URL; bonus points must be greater than " +
  "zero for sign-up and points bonus offers; remove placeholder wording " +
  "(illustrative).";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ email: "admin@example.com" });
  mocks.checkRateLimit.mockResolvedValue({ success: true });
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.insertCardOffer.mockResolvedValue({ ok: true, id: "card-created" });
  mocks.setCardOfferPublished.mockResolvedValue({ ok: true });
  mocks.updateCardOffer.mockResolvedValue({ ok: true });
  mocks.redirect.mockReturnValue(undefined);
});

describe("card-offer publish actions", () => {
  it("allows an incomplete offer to be saved as a draft", async () => {
    await createCardOffer(
      {},
      offerForm({
        bonus_points: "",
        offer_summary: "Illustrative offer",
        source_url: "",
        confidence: "needs-verification",
        expiry_date: "",
      })
    );

    expect(mocks.insertCardOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        bonusPoints: null,
        confidence: "needs-verification",
        expiryDate: null,
        isPublished: false,
      })
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/card-offers");
  });

  it("blocks create and update when the submitted published row is not ready", async () => {
    mocks.insertCardOffer.mockResolvedValueOnce({ ok: false, error: PUBLISH_ERROR });
    mocks.updateCardOffer.mockResolvedValueOnce({ ok: false, error: PUBLISH_ERROR });
    const form = () =>
      offerForm({
        bonus_points: "",
        offer_summary: "Illustrative offer",
        source_url: "http://issuer.example/card",
        confidence: "needs-verification",
        expiry_date: "",
        is_published: true,
      });

    const createResult = await createCardOffer({}, form());
    const updateResult = await updateCardOffer("card-1", {}, form());

    expect(createResult.error).toContain("Cannot publish:");
    expect(createResult.error).toContain("confidence must be Confirmed");
    expect(createResult.error).toContain("expiry date is required");
    expect(createResult.error).toContain("valid HTTPS URL");
    expect(createResult.error).toContain("bonus points must be greater than zero");
    expect(createResult.error).toContain("remove placeholder wording (illustrative)");
    expect(updateResult.error).toBe(createResult.error);
    expect(mocks.insertCardOffer).toHaveBeenCalledTimes(1);
    expect(mocks.updateCardOffer).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("returns the repository's expected error from the list-page toggle", async () => {
    const error =
      "Cannot publish: confidence must be Confirmed; expiry date is required; " +
      "remove placeholder wording (demo row).";
    mocks.setCardOfferPublished.mockResolvedValueOnce({ ok: false, error });

    const result = await setPublished("card-1", true);

    expect(result).toEqual({ error });
    expect(mocks.setCardOfferPublished).toHaveBeenCalledWith("card-1", true);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("publishes a ready persisted row and revalidates every consumer", async () => {
    await expect(setPublished("card-1", true)).resolves.toEqual({ ok: true });

    expect(mocks.setCardOfferPublished).toHaveBeenCalledWith("card-1", true);
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/admin/card-offers",
      "/admin/dashboard",
      "/admin/cleanup",
      "/cards",
      "/search",
    ]);
  });

  it("always allows unpublishing without requiring readiness", async () => {
    await expect(setPublished("card-1", false)).resolves.toEqual({ ok: true });

    expect(mocks.setCardOfferPublished).toHaveBeenCalledWith("card-1", false);
  });
});
