import { describe, expect, it } from "vitest";
import {
  buildTermsRows,
  EARLY_WITHDRAWAL_DISCLAIMER,
  formatExpiry,
  formatTimeAU,
} from "@/lib/giftcards/termsRows";
import { makeBareOffer, makeOffer } from "./offerFixture";

const row = (rows: ReturnType<typeof buildTermsRows>, key: string) =>
  rows.find((r) => r.key === key);

describe("formatTimeAU", () => {
  it("renders 24h HH:MM as 12-hour AM/PM", () => {
    expect(formatTimeAU("23:59")).toBe("11:59 PM");
    expect(formatTimeAU("00:05")).toBe("12:05 AM");
    expect(formatTimeAU("12:00")).toBe("12:00 PM");
    expect(formatTimeAU("09:30")).toBe("9:30 AM");
  });

  it("rejects non-times instead of guessing", () => {
    expect(formatTimeAU("25:00")).toBeNull();
    expect(formatTimeAU("midnight")).toBeNull();
    expect(formatTimeAU(null)).toBeNull();
  });
});

describe("formatExpiry", () => {
  it("combines date, exact time and stated timezone", () => {
    expect(formatExpiry(makeOffer())).toBe("17 Jul 2026, 11:59 PM AEST");
  });

  it("omits the time when only a date is recorded", () => {
    expect(formatExpiry(makeOffer({ expiryTime: null, expiryTimezone: null }))).toBe(
      "17 Jul 2026"
    );
  });

  it("omits the timezone when it was not stated", () => {
    expect(formatExpiry(makeOffer({ expiryTimezone: null }))).toBe(
      "17 Jul 2026, 11:59 PM"
    );
  });

  it("is null with no expiry date at all", () => {
    expect(formatExpiry(makeBareOffer())).toBeNull();
  });
});

describe("buildTermsRows", () => {
  it("shows the promo code as a structured row", () => {
    const rows = buildTermsRows(makeOffer());
    expect(row(rows, "promo-code")?.value).toBe("FEELING10");
  });

  it("flags a required-but-unrecorded promo code as missing, never invented", () => {
    const rows = buildTermsRows(makeOffer({ promoCode: null, couponRequired: true }));
    expect(row(rows, "promo-code")).toBeDefined();
    expect(row(rows, "promo-code")?.value).toBeNull();
  });

  it("omits the promo-code row entirely when no code is involved", () => {
    const rows = buildTermsRows(makeOffer({ promoCode: null, couponRequired: false }));
    expect(row(rows, "promo-code")).toBeUndefined();
  });

  it("renders the purchase cap as a labelled dollar row", () => {
    const rows = buildTermsRows(makeOffer());
    expect(row(rows, "purchase-cap")?.value).toContain("$3,000");
  });

  it("covers the full Card.Gift-style structured term set", () => {
    const rows = buildTermsRows(makeOffer());
    expect(row(rows, "expires")?.value).toBe("17 Jul 2026, 11:59 PM AEST");
    expect(row(rows, "uses-per-customer")?.value).toBe("One use");
    expect(row(rows, "formats")?.value).toBe("Physical and digital cards");
    expect(row(rows, "shipping")?.value).toContain("Shipping fees may apply");
    expect(row(rows, "geography")?.value).toBe("Australian customers only");
    expect(row(rows, "combinability")?.value).toContain(
      "Cannot be combined with another promotion"
    );
    expect(row(rows, "terms-url")?.href).toBe("https://card.gift/terms");
  });

  it("always includes the early-withdrawal disclaimer", () => {
    expect(row(buildTermsRows(makeBareOffer()), "early-withdrawal")?.value).toBe(
      EARLY_WITHDRAWAL_DISCLAIMER
    );
  });

  it("marks the official terms as unrecorded when no URL exists", () => {
    const rows = buildTermsRows(makeBareOffer());
    expect(row(rows, "terms-url")?.value).toBeNull();
    expect(row(rows, "terms-url")?.href).toBeUndefined();
  });

  it("falls back to the prose limit when no numeric uses count exists", () => {
    const rows = buildTermsRows(
      makeOffer({ usesPerCustomer: null, limitPerCustomer: "Two per household" })
    );
    expect(row(rows, "uses-per-customer")?.value).toBe("Two per household");
  });

  it("expiry stays a row (null value) when nothing is recorded", () => {
    const rows = buildTermsRows(makeBareOffer());
    expect(row(rows, "expires")).toBeDefined();
    expect(row(rows, "expires")?.value).toBeNull();
  });
});

describe("dev wording never reaches the public terms table", () => {
  it("scrubs '(sample)' from the limit-per-customer row", () => {
    const rows = buildTermsRows(
      makeOffer({ usesPerCustomer: null, limitPerCustomer: "No stated cap (sample)" })
    );
    expect(row(rows, "uses-per-customer")?.value).toBe("No stated cap");
  });

  it("scrubs dev wording from the denomination note", () => {
    const rows = buildTermsRows(
      makeOffer({ denominationNote: "Sample: $50 and $100 cards only" })
    );
    expect(row(rows, "denominations")?.value).toBe("$50 and $100 cards only");
  });
});
