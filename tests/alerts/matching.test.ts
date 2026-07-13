import { describe, expect, it } from "vitest";
import { alertCandidateMatches, matchingAlertCandidates } from "@/lib/alerts/matching";
import type { AlertCandidate } from "@/lib/alerts/types";

const candidate: AlertCandidate = {
  dedupeKey: "gift-card:apple:2026-07-15",
  title: "Apple at Woolworths",
  detailPath: "/gift-cards/apple",
  storeKey: "woolworths",
  giftCardBrandKey: "apple",
  programmeKey: "everyday-rewards",
  expiryDate: "2026-07-15",
  valueLabel: "20× Everyday Rewards",
};

describe("email alert matching", () => {
  it("matches store, gift-card brand and programme exactly after normalisation", () => {
    expect(alertCandidateMatches({ kind: "store", key: "woolworths" }, candidate, "2026-07-13")).toBe(true);
    expect(alertCandidateMatches({ kind: "gift-card-brand", key: "apple" }, candidate, "2026-07-13")).toBe(true);
    expect(alertCandidateMatches({ kind: "programme", key: "everyday-rewards" }, candidate, "2026-07-13")).toBe(true);
    expect(alertCandidateMatches({ kind: "store", key: "coles" }, candidate, "2026-07-13")).toBe(false);
  });

  it("limits expiring-soon to today through two days ahead", () => {
    expect(alertCandidateMatches({ kind: "expiring-soon", key: null }, candidate, "2026-07-13")).toBe(true);
    expect(alertCandidateMatches({ kind: "expiring-soon", key: null }, { ...candidate, expiryDate: "2026-07-16" }, "2026-07-13")).toBe(false);
    expect(alertCandidateMatches({ kind: "expiring-soon", key: null }, { ...candidate, expiryDate: "2026-07-12" }, "2026-07-13")).toBe(false);
    expect(alertCandidateMatches({ kind: "expiring-soon", key: null }, { ...candidate, expiryDate: null }, "2026-07-13")).toBe(false);
  });

  it("returns only matching candidates", () => {
    expect(matchingAlertCandidates({ kind: "store", key: "woolworths" }, [candidate, { ...candidate, dedupeKey: "other", storeKey: "coles" }], "2026-07-13")).toHaveLength(1);
  });
});
