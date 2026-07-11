import { describe, expect, it } from "vitest";
import { parseCardNumberParam } from "@/lib/admin/cardOfferPrefill";

describe("card-offer detection prefill", () => {
  it("does not turn an absent or blank query parameter into zero", () => {
    expect(parseCardNumberParam(undefined, 100_000)).toBeNull();
    expect(parseCardNumberParam("  ", 100_000)).toBeNull();
  });

  it("accepts explicit zero and bounded positive values", () => {
    expect(parseCardNumberParam("0", 100_000)).toBe(0);
    expect(parseCardNumberParam(["450", "999"], 100_000)).toBe(450);
  });

  it("rejects non-numeric, negative, and out-of-range values", () => {
    expect(parseCardNumberParam("free", 100_000)).toBeNull();
    expect(parseCardNumberParam("-1", 100_000)).toBeNull();
    expect(parseCardNumberParam("100001", 100_000)).toBeNull();
  });
});
