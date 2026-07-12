import { describe, expect, it } from "vitest";
import { giftCardDateState } from "@/lib/giftcards/dateState";

const NOW = new Date("2026-07-13T01:00:00Z");

describe("gift-card offer date state", () => {
  it("distinguishes explicit ongoing from missing expiry", () => {
    expect(giftCardDateState({ isOngoing: true }, NOW)).toBe("ongoing");
    expect(giftCardDateState({}, NOW)).toBe("missing");
  });

  it("distinguishes future, active and expired promotions", () => {
    expect(
      giftCardDateState(
        { startDate: "2026-07-15", expiryDate: "2026-07-21" },
        NOW
      )
    ).toBe("future");
    expect(
      giftCardDateState(
        { startDate: "2026-07-08", expiryDate: "2026-07-14" },
        NOW
      )
    ).toBe("active");
    expect(giftCardDateState({ expiryDate: "2026-07-09" }, NOW)).toBe(
      "expired"
    );
  });
});
