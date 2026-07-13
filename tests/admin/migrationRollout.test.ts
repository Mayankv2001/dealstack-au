import { describe, expect, it } from "vitest";
import {
  approvalPhrase,
  buildEvidence,
  hashOfferRows,
  normaliseMigrationFilename,
} from "@/lib/tooling/migrationRollout";

describe("migration rollout safety helpers", () => {
  it("accepts only repository migration basenames", () => {
    expect(normaliseMigrationFilename("023_gift_card_accuracy_model.sql")).toBe(
      "023_gift_card_accuracy_model.sql"
    );
    expect(() => normaliseMigrationFilename("../023.sql")).toThrow(/filename/i);
    expect(() => normaliseMigrationFilename("023-gift.sql")).toThrow(/filename/i);
  });

  it("requires a migration-specific production phrase", () => {
    expect(approvalPhrase("023_gift_card_accuracy_model.sql")).toBe(
      "APPROVE 023_gift_card_accuracy_model.sql FOR PRODUCTION"
    );
  });

  it("hashes offer rows deterministically regardless of query order", () => {
    const rows = [
      { id: "b", updated_at: "2026-07-13T00:00:00Z" },
      { id: "a", updated_at: null },
    ];
    expect(hashOfferRows(rows)).toBe(hashOfferRows([...rows].reverse()));
  });

  it("produces pasteable evidence and detects public-data drift", () => {
    const unchanged = buildEvidence(
      { migration: "023_x.sql", beforeHash: "same", capturedAt: "before" },
      "same",
      "after"
    );
    expect(unchanged.publicOfferDataUnchanged).toBe(true);
    expect(unchanged).toMatchObject({
      schemaProbe: "passed",
      generatedTypes: "passed",
      typecheck: "passed",
      manifestTests: "passed",
    });
    expect(
      buildEvidence(
        { migration: "023_x.sql", beforeHash: "before", capturedAt: "before" },
        "after",
        "done"
      ).publicOfferDataUnchanged
    ).toBe(false);
  });
});
