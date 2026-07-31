import { describe, expect, it } from "vitest";
import { makePoints } from "./factories";

/**
 * `conditionsNote` is optional data, so the contract worth pinning is that a
 * row without one is a legitimate row — not something that renders an empty
 * block or trips a required-field check somewhere downstream.
 */

describe("points offer conditions note", () => {
  it("defaults to null, so an offer without recorded terms is still valid", () => {
    expect(makePoints().conditionsNote).toBeNull();
  });

  it("carries a recorded note through unchanged", () => {
    const note = "In store only. Limit five per account in total.";
    expect(makePoints({ conditionsNote: note }).conditionsNote).toBe(note);
  });

  it("keeps the note separate from the headline earn rate", () => {
    // The note must never be folded into earn_rate_display — that field is the
    // headline and is what the stack engine labels a component with.
    const offer = makePoints({
      earnRateDisplay: "20x points on Apple gift cards",
      conditionsNote: "Limit five per day.",
    });
    expect(offer.earnRateDisplay).not.toContain("Limit");
  });
});
