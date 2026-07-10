import { describe, expect, it } from "vitest";
import {
  RECHECKABLE_TABLES,
  recheckTableFor,
  type RecheckableType,
} from "@/lib/admin/repos/recheck";

/**
 * recheckTableFor — the allow-list that is both the type→table map AND the
 * injection boundary for the "Mark re-checked" action. No DB.
 */

describe("recheckTableFor — mapped types", () => {
  it("maps each re-checkable type to its exact table", () => {
    expect(recheckTableFor("cashback")).toBe("cashback_offers");
    expect(recheckTableFor("giftCards")).toBe("gift_card_offers");
    expect(recheckTableFor("points")).toBe("points_offers");
    expect(recheckTableFor("cardOffers")).toBe("card_offers");
    expect(recheckTableFor("signals")).toBe("ozbargain_signals");
  });
});

describe("recheckTableFor — types without a last_checked_at column", () => {
  it("returns null for stores and weekly deals", () => {
    expect(recheckTableFor("stores")).toBeNull();
    expect(recheckTableFor("weeklyDeals")).toBeNull();
  });
});

describe("recheckTableFor — injection / garbage input", () => {
  it("returns null for empty, unknown, or crafted table-name inputs", () => {
    expect(recheckTableFor("")).toBeNull();
    expect(recheckTableFor("audit_log")).toBeNull();
    expect(recheckTableFor("admins; drop table admins")).toBeNull();
    expect(recheckTableFor("cashback_offers")).toBeNull(); // the raw table name is NOT a valid key
    expect(recheckTableFor("__proto__")).toBeNull();
  });
});

describe("RECHECKABLE_TABLES — compile-time key subset", () => {
  it("documents that keys are a subset of RecentItemType (enforced by `satisfies`)", () => {
    // If a key here ever drifts from RecentItemType, the `satisfies` clause in
    // recheck.ts fails to compile — this runtime assertion just pins the shape.
    const keys = Object.keys(RECHECKABLE_TABLES) as RecheckableType[];
    expect(keys).toEqual([
      "cashback",
      "giftCards",
      "points",
      "cardOffers",
      "signals",
    ]);
  });
});
