import { describe, expect, it } from "vitest";
import { findPlaceholderMarkers } from "@/lib/admin/placeholderCopy";

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
});
