import { describe, expect, it } from "vitest";
import { pluralise } from "@/lib/text/pluralise";

describe("pluralise", () => {
  it("renders singular and plural count copy without split suffixes", () => {
    expect(pluralise(1, "offer")).toBe("1 offer");
    expect(pluralise(11, "offer")).toBe("11 offers");
    expect(pluralise(2, "approved offer")).toBe("2 approved offers");
  });
});
