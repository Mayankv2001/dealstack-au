import { describe, expect, it } from "vitest";
import {
  filterProductionSignals,
  filterSeedableSignals,
} from "@/scripts/seed-filters";

const rows = [
  { id: "same", source_native_id: "100", title: "same" },
  { id: "different", source_native_id: "200", title: "different" },
  { id: "manual", source_native_id: null, title: "manual" },
];

describe("filterSeedableSignals", () => {
  it("keeps all rows when no keys exist", () => {
    expect(filterSeedableSignals(rows, [])).toEqual({ seedable: rows, skipped: [] });
  });

  it("keeps same-id and null keys but reports different-id ownership", () => {
    const result = filterSeedableSignals(rows, [
      { id: "same", source_native_id: "100" },
      { id: "production-row", source_native_id: "200" },
      { id: "another-manual", source_native_id: null },
    ]);
    expect(result.seedable.map((row) => row.id)).toEqual(["same", "manual"]);
    expect(result.skipped).toEqual([
      { row: rows[1], ownedById: "production-row" },
    ]);
  });

  it("preserves ordering in a mixed batch", () => {
    const result = filterSeedableSignals(rows, [
      { id: "owner", source_native_id: "200" },
    ]);
    expect(result.seedable.map((row) => row.id)).toEqual(["same", "manual"]);
  });
});

describe("filterProductionSignals", () => {
  it("excludes static samples so seeding cannot publish demo signals", () => {
    const signals = [
      { id: "sample", isSample: true },
      { id: "curated", isSample: false },
    ];
    expect(filterProductionSignals(signals)).toEqual([signals[1]]);
  });
});
