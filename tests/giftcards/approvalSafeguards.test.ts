import { describe, expect, it } from "vitest";
import {
  assessCompoundCampaign,
  detectMembershipSignal,
  detectSpendThreshold,
  splitBrandList,
  COMPOUND_BRAND_THRESHOLD,
} from "@/lib/giftcards/approvalSafeguards";

describe("splitBrandList", () => {
  it("splits on commas only, keeping ampersands inside brand names", () => {
    expect(splitBrandList("Uber & Uber Eats, Harris Farm")).toEqual([
      "Uber & Uber Eats",
      "Harris Farm",
    ]);
  });
});

describe("assessCompoundCampaign", () => {
  it("flags the 33-brand Amazon catalogue dump as compound", () => {
    const brand = Array.from({ length: 33 }, (_, i) => `Brand ${i}`).join(", ");
    const a = assessCompoundCampaign(brand);
    expect(a.isCompound).toBe(true);
    expect(a.brandCount).toBe(33);
    expect(a.reason).toMatch(/compound campaign/i);
  });

  it("does not flag a genuine small bundle (4–5 cards)", () => {
    expect(assessCompoundCampaign("TCN Love, TCN Shop, TCN Cinema, TCN Good Food").isCompound).toBe(false);
    expect(assessCompoundCampaign("TCN Baby, TCN Gift, TCN Teen, TCN Deluxe, The Holiday & Hotel").isCompound).toBe(false);
  });

  it("uses the documented threshold boundary", () => {
    const atThreshold = Array.from({ length: COMPOUND_BRAND_THRESHOLD }, (_, i) => `B${i}`).join(", ");
    const overThreshold = Array.from({ length: COMPOUND_BRAND_THRESHOLD + 1 }, (_, i) => `B${i}`).join(", ");
    expect(assessCompoundCampaign(atThreshold).isCompound).toBe(false);
    expect(assessCompoundCampaign(overThreshold).isCompound).toBe(true);
  });
});

describe("detectMembershipSignal", () => {
  it("detects member-portal sellers", () => {
    expect(detectMembershipSignal("RACV Member Benefits portal", "RACV")).not.toBeNull();
    expect(detectMembershipSignal("NRMA Blue member portal", "NRMA Blue")).not.toBeNull();
  });

  it("detects Prime / members-only language", () => {
    expect(detectMembershipSignal("Amazon", "Amazon Prime exclusive")).not.toBeNull();
    expect(detectMembershipSignal("Shop", "members only sale")).not.toBeNull();
  });

  it("does not fire on plain retail sellers", () => {
    expect(detectMembershipSignal("Amazon", "Gift Card Database")).toBeNull();
    expect(detectMembershipSignal("Woolworths supermarkets", "GCDB")).toBeNull();
    expect(detectMembershipSignal("Coles", "GCDB", "Apple")).toBeNull();
  });
});

describe("detectSpendThreshold", () => {
  it("detects a '$100+' style threshold (the Coles Group bonus)", () => {
    expect(
      detectSpendThreshold("Sample: 2,000 bonus Flybuys when you buy $100+ in Coles Group gift cards")
    ).toBe(true);
  });

  it("detects 'spend $X' and 'min spend $X'", () => {
    expect(detectSpendThreshold("Spend $50 to qualify")).toBe(true);
    expect(detectSpendThreshold("Min. spend $30")).toBe(true);
  });

  it("does not fire without a dollar threshold", () => {
    expect(detectSpendThreshold("One use per customer")).toBe(false);
    expect(detectSpendThreshold("")).toBe(false);
    expect(detectSpendThreshold(null, undefined)).toBe(false);
  });
});
