import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  outcomeToStatus,
  type PredictionStatus,
} from "@/lib/admin/repos/giftCardPredictions";
import type { PredictionOutcome } from "@/lib/giftcards/reconcilePredictions";

const ROOT = new URL("../../", import.meta.url).pathname;

/** Every .ts/.tsx file under a directory, recursively. */
function tsFiles(relDir: string): string[] {
  const abs = join(ROOT, relDir);
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(abs);
  return out;
}

// Surfaces that feed active/public offers, search, planner and the homepage.
// None of them may reach the prediction parser or repository.
const LIVE_SURFACES = [
  ...tsFiles("lib/repos"),
  ...tsFiles("lib/decision"),
  ...tsFiles("lib/stack"),
  join(ROOT, "lib/giftcards/publicQuery.ts"),
  join(ROOT, "lib/giftcards/weeklyOffers.ts"),
  join(ROOT, "lib/giftcards/marquee.ts"),
];

const FORBIDDEN = ["parsePredictions", "giftCardPredictions"];

describe("prediction isolation — no live surface imports predictions", () => {
  it.each(LIVE_SURFACES)("%s does not import a prediction module", (file) => {
    const src = readFileSync(file, "utf8");
    for (const token of FORBIDDEN) {
      // Match only import/require specifiers, not incidental substrings.
      const importRe = new RegExp(
        `(import[^;]*from\\s*["'][^"']*${token}|require\\(["'][^"']*${token})`
      );
      expect(importRe.test(src), `${file} must not import ${token}`).toBe(false);
    }
  });
});

describe("prediction repo — never touches the public offer table", () => {
  it("does not reference gift_card_offers as a write target", () => {
    const repo = readFileSync(
      join(ROOT, "lib/admin/repos/giftCardPredictions.ts"),
      "utf8"
    );
    expect(repo).not.toMatch(/from\(["']gift_card_offers/);
    expect(repo).not.toMatch(/insert[\s\S]{0,40}gift_card_offers/);
  });

  it("captures only pasted/uploaded snapshots and performs no network request", () => {
    const action = readFileSync(
      join(ROOT, "app/admin/(protected)/gift-cards/predictions/actions.ts"),
      "utf8",
    );
    expect(action).not.toMatch(/\bfetch\s*\(/);
    expect(action).not.toMatch(/from\(["']gift_card_offers/);
    expect(action).toContain("GCDB_PREDICTIONS_URL");
  });
});

describe("prediction status mapping — markers never confirm an offer", () => {
  const outcomes: PredictionOutcome[] = [
    "exact-match",
    "partial-match",
    "different-value",
    "different-family",
    "different-seller",
    "different-dates",
    "no-promotion",
    "did-not-occur",
    "pending",
  ];
  it("never yields the live 'confirmed' status from a reconciliation outcome", () => {
    const statuses = outcomes.map(outcomeToStatus);
    expect(statuses).not.toContain<PredictionStatus>("confirmed");
  });
  it("keeps an unmatched (pending) prediction as 'predicted'", () => {
    expect(outcomeToStatus("pending")).toBe("predicted");
  });
  it("records a clean match as prediction_matched, a miss as prediction_missed", () => {
    expect(outcomeToStatus("exact-match")).toBe("prediction_matched");
    expect(outcomeToStatus("did-not-occur")).toBe("prediction_missed");
  });
});
