import { describe, expect, it, vi } from "vitest";
import {
  formatSeedPlan,
  planSeedChanges,
  REVIEWED_PRODUCT_SEEDS,
  runSeed,
} from "../../scripts/seed-gift-card-products";

describe("reviewed gift-card product seed", () => {
  it("keeps similar product families distinct with field-level evidence", () => {
    const ids = REVIEWED_PRODUCT_SEEDS.map((product) => product.id);
    expect(ids).toContain("tcn-him");
    expect(ids).toContain("tcn-her");
    expect(ids).toContain("ultimate-thanks");
    expect(ids).toContain("ultimate-thank-you");
    expect(new Set(ids).size).toBe(ids.length);
    REVIEWED_PRODUCT_SEEDS.forEach((product) => {
      expect(product.source_evidence).toHaveLength(1);
      expect(product.source_evidence[0].url).toMatch(/^https:\/\//);
      const citedFields = new Set(product.source_evidence.flatMap((evidence) => evidence.fields));
      for (const [field, value] of Object.entries(product)) {
        if (field !== "source_evidence" && value != null) {
          expect(citedFields, `${product.id}.${field} needs cited evidence`).toContain(field);
        }
      }
    });
    for (const product of REVIEWED_PRODUCT_SEEDS.filter((row) => row.id.startsWith("tcn-"))) {
      expect(product.source_evidence[0].url).toContain("/products/");
      expect(product.source_evidence[0].url).not.toBe("https://www.thecardnetwork.com.au/");
    }
  });

  it("prints a safe dry-run plan and never marks existing records for update", () => {
    const plan = planSeedChanges(["apple-gift-card"]);
    expect(plan.find((change) => change.id === "apple-gift-card")?.action).toBe("skip-existing");
    expect(plan.every((change) => change.action === "insert" || change.action === "skip-existing")).toBe(true);
    expect(formatSeedPlan(plan, false).join("\n")).toContain("DRY RUN");
    expect(formatSeedPlan(plan, false).join("\n")).toContain("No database writes");
  });

  it("supports an offline preview without constructing a database client", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(runSeed(false, true)).resolves.toHaveLength(REVIEWED_PRODUCT_SEEDS.length);
    expect(log.mock.calls.flat().join("\n")).toContain("Offline preview");
    log.mockRestore();
  });
});
