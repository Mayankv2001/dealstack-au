import { describe, expect, it } from "vitest";
import { validateReviewedAcceptance } from "@/lib/admin/repos/giftCardAcceptance";

describe("acceptance approval validation", () => {
  const valid = {
    product_id: "ultimate", store_id: "jb-hifi",
    acceptance_status: "confirmed-accepted",
    evidence_url: "https://issuer.example/cards/ultimate",
    evidence_source_type: "issuer-official",
    evidence_captured_at: "2026-07-15T00:00:00Z",
  };
  it("requires evidence URL, tier and captured time", () => {
    expect(validateReviewedAcceptance(valid)).toEqual([]);
    expect(validateReviewedAcceptance({ ...valid, evidence_url: "" })).toContain("A safe HTTPS evidence URL is required.");
    expect(validateReviewedAcceptance({ ...valid, evidence_source_type: "" })).toContain("An evidence tier is required.");
    expect(validateReviewedAcceptance({ ...valid, evidence_captured_at: "bad" })).toContain("A valid evidence capture time is required.");
  });

  it("requires a canonical status and supports reviewed MCC-only identity", () => {
    expect(validateReviewedAcceptance({ ...valid, acceptance_status: "invented" }))
      .toContain("Choose a valid acceptance status.");
    expect(
      validateReviewedAcceptance({
        ...valid,
        store_id: null,
        merchant_name: null,
        mcc: 5732,
      }),
    ).toEqual([]);
  });
});
