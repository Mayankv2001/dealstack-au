import { describe, expect, it } from "vitest";
import { dailyCleanupCutoffs } from "@/lib/admin/repos/dailyPipeline";

describe("daily pipeline lifecycle cutoffs", () => {
  it("computes exact age windows without local-time or DST drift", () => {
    const now = new Date("2026-10-04T00:30:00.000Z");
    const cutoffs = dailyCleanupCutoffs(now, 45);

    expect(cutoffs.signal.toISOString()).toBe("2026-08-20T00:30:00.000Z");
    expect(cutoffs.staleFeed.toISOString()).toBe("2026-08-05T00:30:00.000Z");
    expect(cutoffs.purge.toISOString()).toBe("2026-07-06T00:30:00.000Z");
  });
});
