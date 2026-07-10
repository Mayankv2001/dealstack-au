import { describe, expect, it } from "vitest";
import {
  auToday,
  isExpiredAu,
  labelFor,
  STALE_FEED_DAYS,
} from "@/lib/admin/repos/cleanup";

/**
 * Pure date/classification helpers behind /admin/cleanup. No DB — these must
 * match scripts/cleanup-old-deals.ts and the dashboard DQ report exactly.
 */

describe("auToday — AU-Sydney calendar date", () => {
  it("uses the Sydney calendar day, not UTC (AEST, +10)", () => {
    // 2026-07-09T20:00:00Z → Sydney 2026-07-10 06:00 (still 'today' 10th).
    expect(auToday(new Date("2026-07-09T20:00:00Z"))).toBe("2026-07-10");
  });

  it("rolls the date forward across the AEST→AEDT DST boundary (+11)", () => {
    // AEDT begins 2026-10-04; at 14:30Z the Sydney clock is already on the 4th.
    expect(auToday(new Date("2026-10-03T14:30:00Z"))).toBe("2026-10-04");
    // One hour earlier is still the 3rd in Sydney.
    expect(auToday(new Date("2026-10-03T13:30:00Z"))).toBe("2026-10-03");
  });
});

describe("isExpiredAu — strictly before AU today", () => {
  const today = "2026-07-10";

  it("treats yesterday as expired", () => {
    expect(isExpiredAu("2026-07-09", today)).toBe(true);
  });

  it("treats TODAY as NOT expired (valid through end of day)", () => {
    expect(isExpiredAu("2026-07-10", today)).toBe(false);
  });

  it("treats tomorrow as not expired", () => {
    expect(isExpiredAu("2026-07-11", today)).toBe(false);
  });

  it("treats a null expiry as not expired", () => {
    expect(isExpiredAu(null, today)).toBe(false);
  });
});

describe("labelFor — per-table label shape mirrors the CLI script", () => {
  it("cashback: merchant · provider", () => {
    expect(
      labelFor("cashback_offers", { merchant_id: "jb-hifi", provider: "ShopBack" })
    ).toBe("jb-hifi · ShopBack");
  });

  it("gift card: brand", () => {
    expect(labelFor("gift_card_offers", { brand: "TCN", id: "gc-tcn-jbhifi" })).toBe(
      "TCN"
    );
  });

  it("gift card: falls back to id when brand is missing", () => {
    expect(labelFor("gift_card_offers", { id: "gc-x" })).toBe("gc-x");
  });

  it("points: program · merchant", () => {
    expect(
      labelFor("points_offers", { program: "Qantas", merchant_id: "myer" })
    ).toBe("Qantas · myer");
  });

  it("card offers: provider · card_name", () => {
    expect(
      labelFor("card_offers", { provider: "Amex", card_name: "Platinum" })
    ).toBe("Amex · Platinum");
  });

  it("weekly deals: title", () => {
    expect(labelFor("weekly_deals", { title: "Big Sale", id: "wd-1" })).toBe(
      "Big Sale"
    );
  });
});

describe("STALE_FEED_DAYS", () => {
  it("matches the CLI script default of 60 days", () => {
    expect(STALE_FEED_DAYS).toBe(60);
  });
});
