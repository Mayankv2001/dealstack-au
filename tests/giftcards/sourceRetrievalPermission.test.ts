import { describe, expect, it } from "vitest";
import { decideAutomatedRetrieval } from "@/lib/giftcards/sourceRetrievalPermission";

const permitted = {
  sourceExists: true,
  enabled: true,
  automatedFetchAllowed: true,
  termsCheckedAt: "2026-07-14T00:00:00Z",
  robotsCheckedAt: "2026-07-14T00:00:00Z",
};

describe("automated source retrieval permission", () => {
  it.each([
    ["environment-disabled", false, permitted],
    ["source-missing", true, { ...permitted, sourceExists: false }],
    ["source-disabled", true, { ...permitted, enabled: false }],
    [
      "fetch-not-permitted",
      true,
      { ...permitted, automatedFetchAllowed: false },
    ],
    [
      "permission-review-incomplete",
      true,
      { ...permitted, termsCheckedAt: null },
    ],
    [
      "permission-review-incomplete",
      true,
      { ...permitted, robotsCheckedAt: null },
    ],
  ] as const)("fails closed with %s", (reason, environmentEnabled, state) => {
    expect(decideAutomatedRetrieval(environmentEnabled, state)).toEqual({
      allowed: false,
      reason,
    });
  });

  it("allows retrieval only when every environment and source fact passes", () => {
    expect(decideAutomatedRetrieval(true, permitted)).toEqual({ allowed: true });
  });
});
