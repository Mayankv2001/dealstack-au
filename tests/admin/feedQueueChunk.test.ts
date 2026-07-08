import { describe, expect, it } from "vitest";
import { chunk } from "@/lib/admin/repos/feedQueue";

/**
 * chunk() — the pure helper behind the chunked `.in()` existing-signal lookup
 * in listNewFeedItems. PostgREST puts `.in()` filters in the GET querystring,
 * so the lookup must never pass an unbounded id list to a single call; these
 * tests pin the splitting behaviour that guarantee rests on.
 *
 * Importing the repo module is safe without a DB: getSupabaseAdmin() is only
 * called inside functions, never at module load.
 */

describe("chunk", () => {
  it("returns [] for an empty array", () => {
    expect(chunk([], 100)).toEqual([]);
  });

  it("returns a single chunk when length equals size", () => {
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it("makes the last chunk shorter when there is a remainder", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("splits every item into its own chunk at size 1", () => {
    expect(chunk(["a", "b", "c"], 1)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("preserves order across chunks", () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const flattened = chunk(items, 100).flat();
    expect(flattened).toEqual(items);
    expect(chunk(items, 100).map((c) => c.length)).toEqual([100, 100, 50]);
  });

  it("throws on non-positive size", () => {
    expect(() => chunk([1], 0)).toThrow(/positive/);
    expect(() => chunk([1], -5)).toThrow(/positive/);
  });
});
