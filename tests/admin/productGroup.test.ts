import { describe, expect, it } from "vitest";
import {
  isValidProductGroup,
  parseProductGroup,
} from "@/lib/offers/productGroup";

describe("product group validation", () => {
  it("accepts exact lowercase kebab-case keys and blank as ungrouped", () => {
    expect(parseProductGroup("airpods-pro-3")).toEqual({
      ok: true,
      value: "airpods-pro-3",
    });
    expect(parseProductGroup("  ")).toEqual({ ok: true, value: null });
  });

  it("rejects ambiguous or oversized keys", () => {
    expect(isValidProductGroup("AirPods-Pro-3")).toBe(false);
    expect(isValidProductGroup("airpods--pro")).toBe(false);
    expect(isValidProductGroup("airpods pro")).toBe(false);
    expect(isValidProductGroup("a".repeat(81))).toBe(false);
  });
});
