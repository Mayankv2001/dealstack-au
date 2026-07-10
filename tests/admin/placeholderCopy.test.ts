import { describe, expect, it } from "vitest";
import { findPlaceholderMarkers } from "@/lib/admin/placeholderCopy";
import { STRICT_CONTENT_BANNED_MARKERS } from "../../scripts/smoke-routes";

// Markers in the strict-content public smoke test (scripts/smoke-routes.ts)
// that represent placeholder/demo copy concepts, as opposed to the other
// leak categories it also checks (an expired-unknown badge, an error shell).
const PLACEHOLDER_CONCEPT_MARKERS = STRICT_CONTENT_BANNED_MARKERS.filter(
  (marker) => marker !== "Application error" && marker !== "Expired / unknown"
);

describe("findPlaceholderMarkers", () => {
  it("flags the literal prod placeholder text", () => {
    expect(
      findPlaceholderMarkers([
        "Illustrative sign-up bonus: bonus Qantas Points…",
      ])
    ).toEqual(["illustrative"]);
  });

  it("is case-insensitive", () => {
    expect(findPlaceholderMarkers(["ILLUSTRATIVE example"])).toEqual([
      "illustrative",
    ]);
  });

  it("flags placeholder", () => {
    expect(findPlaceholderMarkers(["placeholder URL"])).toEqual([
      "placeholder",
    ]);
  });

  it("flags lorem ipsum", () => {
    expect(findPlaceholderMarkers(["lorem ipsum dolor"])).toEqual(["lorem"]);
  });

  it("does not flag legitimate offer copy (precision)", () => {
    expect(findPlaceholderMarkers(["Free sample with every order"])).toEqual(
      []
    );
    expect(
      findPlaceholderMarkers(["for example, stack with gift cards"])
    ).toEqual([]);
    expect(findPlaceholderMarkers(["Sample the range in store"])).toEqual([]);
    expect(findPlaceholderMarkers(["5.5% off Ultimate Gift Cards"])).toEqual(
      []
    );
  });

  it("returns empty for empty/null/undefined input", () => {
    expect(findPlaceholderMarkers([])).toEqual([]);
    expect(findPlaceholderMarkers([null, undefined, ""])).toEqual([]);
  });

  it("flags when only one of several inputs is dirty", () => {
    expect(findPlaceholderMarkers(["clean text", "sample data set"])).toEqual(
      ["sample data"]
    );
  });

  it("dedupes repeated markers", () => {
    expect(
      findPlaceholderMarkers(["illustrative … illustrative"])
    ).toEqual(["illustrative"]);
  });

  it("stays aligned with the strict-content smoke test's placeholder markers", () => {
    // Every placeholder/demo marker the public smoke test bans
    // (scripts/smoke-routes.ts STRICT_CONTENT_BANNED_MARKERS) must actually
    // be something this gate flags — otherwise a card_offers row could carry
    // banned copy that passes admin review (cardOfferReadiness delegates to
    // findPlaceholderMarkers) yet slip past the smoke test's own list, or
    // vice versa.
    expect(PLACEHOLDER_CONCEPT_MARKERS.length).toBeGreaterThan(0);
    for (const marker of PLACEHOLDER_CONCEPT_MARKERS) {
      expect(findPlaceholderMarkers([marker]).length).toBeGreaterThan(0);
    }
  });
});
