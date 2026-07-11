import { describe, expect, it } from "vitest";
import {
  capReachedWarning,
  cashbackCapReachedWarning,
  cashbackConflictsWithGiftCard,
  expirySoonWarning,
  giftCardCashbackConflictWarning,
  isGiftCardAcceptedAtMerchant,
  needsVerificationWarning,
  staleDataWarning,
  worstConfidence,
} from "../../lib/stack/compatibility";
import { makeCashback, makeGiftCard } from "./factories";

// Fixed clock so the time-based rules are deterministic (matches the engine's
// SAMPLE_NOW of mid-June 2026).
const NOW = new Date("2026-06-13T12:00:00+10:00");

describe("worstConfidence", () => {
  it("defaults to needs-verification for an empty list", () => {
    expect(worstConfidence([])).toBe("needs-verification");
  });

  it("picks the least-confident value (worst wins)", () => {
    expect(worstConfidence(["confirmed", "needs-verification"])).toBe(
      "needs-verification"
    );
    expect(
      worstConfidence(["confirmed", "expired-unknown", "needs-verification"])
    ).toBe("expired-unknown");
  });

  it("returns confirmed only when everything is confirmed", () => {
    expect(worstConfidence(["confirmed", "confirmed"])).toBe("confirmed");
  });
});

describe("isGiftCardAcceptedAtMerchant", () => {
  it("matches against the accepted-merchant list", () => {
    const gc = makeGiftCard({ acceptedAtMerchantIds: ["myer", "coles"] });
    expect(isGiftCardAcceptedAtMerchant(gc, "myer")).toBe(true);
    expect(isGiftCardAcceptedAtMerchant(gc, "kogan")).toBe(false);
  });
});

describe("cashbackConflictsWithGiftCard", () => {
  it("conflicts only when paying by gift card AND the offer excludes it", () => {
    const excludes = makeCashback({ excludesGiftCardPayment: true });
    const allows = makeCashback({ excludesGiftCardPayment: false });
    expect(cashbackConflictsWithGiftCard(excludes, true)).toBe(true);
    expect(cashbackConflictsWithGiftCard(excludes, false)).toBe(false);
    expect(cashbackConflictsWithGiftCard(allows, true)).toBe(false);
  });
});

describe("expirySoonWarning", () => {
  it("returns null when there is no expiry date", () => {
    expect(expirySoonWarning(null, NOW, "X")).toBeNull();
  });

  it("flags an expiry within the soon window", () => {
    const w = expirySoonWarning("2026-06-15", NOW, "The code");
    expect(w).not.toBeNull();
    expect(w?.code).toBe("expiry-soon");
    expect(w?.level).toBe("caution");
  });

  it("ignores an expiry comfortably in the future", () => {
    expect(expirySoonWarning("2026-07-15", NOW, "X")).toBeNull();
  });

  it("ignores an already-passed expiry (handled elsewhere)", () => {
    expect(expirySoonWarning("2026-06-10", NOW, "X")).toBeNull();
  });

  it("AEDT regression pin: no warning for an offer already expired in AU time", () => {
    // Old code: end-of-day at +10:00 (13:59:59Z) > now (13:30Z) → warned on an
    // expired offer. Calendar compare: 2026-01-16 (AEDT today) > 2026-01-15 → null.
    expect(expirySoonWarning("2026-01-15", new Date("2026-01-15T13:30:00Z"), "X")).toBeNull();
  });

  it("warns across the full 7-calendar-day window (unified with public cards)", () => {
    // NOW is 2026-06-13 AU time; 2026-06-20 is exactly 7 calendar days out.
    // The old ms-window said null here while the public card already showed
    // "expiring soon" via isExpiringSoonAU — this pin locks the unification.
    expect(expirySoonWarning("2026-06-20", NOW, "X")).not.toBeNull();
  });
});

describe("staleDataWarning", () => {
  it("returns null for a recent check", () => {
    expect(
      staleDataWarning("2026-06-12T00:00:00+10:00", NOW, "X")
    ).toBeNull();
  });

  it("flags a check older than the stale window", () => {
    const w = staleDataWarning("2026-05-01T00:00:00+10:00", NOW, "The offer");
    expect(w?.code).toBe("stale-data");
    expect(w?.level).toBe("info");
    // Human-readable AU date, never a raw ISO string.
    expect(w?.message).toContain("1 May 2026");
    expect(w?.message).not.toContain("2026-05-01");
  });

  it("returns null for missing or unparseable dates", () => {
    expect(staleDataWarning(null, NOW, "X")).toBeNull();
    expect(staleDataWarning("not-a-date", NOW, "X")).toBeNull();
  });
});

describe("needsVerificationWarning", () => {
  it("returns null for confirmed offers", () => {
    expect(needsVerificationWarning("confirmed", "X")).toBeNull();
  });

  it("warns (unverified) for needs-verification", () => {
    const w = needsVerificationWarning("needs-verification", "The offer");
    expect(w?.code).toBe("needs-verification");
    expect(w?.level).toBe("caution");
    expect(w?.message).toContain("unverified");
  });

  it("warns (appears expired) for expired-unknown", () => {
    const w = needsVerificationWarning("expired-unknown", "The offer");
    expect(w?.message).toContain("appears expired");
  });
});

describe("giftCardCashbackConflictWarning", () => {
  it("returns a risk warning when the conflict applies", () => {
    const cashback = makeCashback({ excludesGiftCardPayment: true });
    const w = giftCardCashbackConflictWarning(cashback, true);
    expect(w?.code).toBe("gift-card-excluded-from-cashback");
    expect(w?.level).toBe("risk");
  });

  it("returns null when there is no conflict", () => {
    expect(
      giftCardCashbackConflictWarning(
        makeCashback({ excludesGiftCardPayment: true }),
        false
      )
    ).toBeNull();
    expect(
      giftCardCashbackConflictWarning(
        makeCashback({ excludesGiftCardPayment: false }),
        true
      )
    ).toBeNull();
  });
});

describe("capReachedWarning", () => {
  it("returns null for an uncapped layer", () => {
    expect(capReachedWarning(null, 1000, "X")).toBeNull();
  });

  it("returns null while within the cap", () => {
    expect(capReachedWarning(50, 50, "X")).toBeNull();
  });

  it("warns once the applied amount exceeds the cap", () => {
    const w = capReachedWarning(50, 51, "The offer");
    expect(w?.code).toBe("cap-reached");
    expect(w?.level).toBe("caution");
  });
});

describe("cashbackCapReachedWarning", () => {
  it("returns null for an uncapped offer", () => {
    expect(cashbackCapReachedWarning(null, 1000, "X")).toBeNull();
  });

  it("returns null when the raw saving is within the cap", () => {
    expect(cashbackCapReachedWarning(50, 50, "X")).toBeNull();
  });

  it("warns once the raw saving exceeds the cap", () => {
    const w = cashbackCapReachedWarning(50, 51, "The offer");
    expect(w?.code).toBe("cap-reached");
    expect(w?.level).toBe("caution");
  });
});
