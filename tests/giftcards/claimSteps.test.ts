import { describe, expect, it } from "vitest";
import { buildClaimSteps } from "@/lib/giftcards/claimSteps";
import { makeBareOffer, makeOffer } from "./offerFixture";

const texts = (offer: Parameters<typeof buildClaimSteps>[0]) =>
  buildClaimSteps(offer).map((s) => s.text);

describe("buildClaimSteps", () => {
  it("produces an original numbered flow from structured fields", () => {
    const steps = texts(makeOffer());
    expect(steps[0]).toBe("Open Card.Gift.");
    expect(steps).toContain("Choose an eligible TCN gift card.");
    expect(steps).toContain("Enter promo code FEELING10 at checkout.");
    expect(steps).toContain("Check the saving is applied before you pay.");
    expect(steps.at(-1)).toBe("Complete payment.");
  });

  it("adds membership and activation steps only when required", () => {
    const gated = texts(
      makeOffer({ membershipRequired: true, activationRequired: true })
    );
    expect(gated).toContain("Sign in with your eligible membership.");
    expect(gated).toContain("Activate the offer before you buy.");

    const open = texts(makeOffer());
    expect(open).not.toContain("Sign in with your eligible membership.");
    expect(open).not.toContain("Activate the offer before you buy.");
  });

  it("never invents a code it does not have", () => {
    const steps = texts(makeOffer({ promoCode: null, couponRequired: true }));
    expect(steps).toContain("Enter the promo code from the source at checkout.");
    expect(steps.join(" ")).not.toMatch(/FEELING10/);
  });

  it("omits the code step entirely when no code is involved", () => {
    const steps = texts(makeOffer({ promoCode: null, couponRequired: false }));
    expect(steps.some((s) => s.includes("promo code"))).toBe(false);
  });

  it("notes shipping on payment only when shipping may apply", () => {
    const withShipping = buildClaimSteps(makeOffer());
    expect(withShipping.at(-1)?.note).toContain("shipping fee");
    const without = buildClaimSteps(makeOffer({ shippingMayApply: false }));
    expect(without.at(-1)?.note).toBeUndefined();
  });

  it("degrades to the honest minimum for a bare offer", () => {
    const steps = texts(makeBareOffer());
    expect(steps[0]).toBe("Open RACV Member Benefits.");
    expect(steps).toContain("Choose an eligible Ultimate gift card.");
    expect(steps.at(-1)).toBe("Complete payment.");
    // No invented conditions on a bare offer.
    expect(steps.some((s) => s.includes("promo code"))).toBe(false);
    expect(steps.some((s) => s.includes("membership"))).toBe(false);
  });
});
