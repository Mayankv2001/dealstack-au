import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COVERED_MIGRATIONS,
  EXPECTED_SCHEMA,
  findManifestCoverageErrors,
} from "../../scripts/schema-manifest";

/**
 * Manifest self-audit for the schema-drift probe (scripts/verify-schema.ts).
 *
 * The scheduled watchdog is only as good as its manifest: a migration added
 * without registering its tables/columns would make a green probe falsely
 * reassuring. This suite reads the REAL supabase/migrations directory, so the
 * author of migration 008+ must extend scripts/schema-manifest.ts in the same
 * PR or `npm run test:admin` fails.
 */

function migrationFilesOnDisk(): string[] {
  return readdirSync(join(process.cwd(), "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

describe("schema manifest covers the committed migrations", () => {
  it("finds no coverage errors against the real supabase/migrations directory", () => {
    expect(findManifestCoverageErrors(migrationFilesOnDisk())).toEqual([]);
  });

  it("fails loudly when a new migration file is not registered", () => {
    const errors = findManifestCoverageErrors([
      ...migrationFilesOnDisk(),
      "008_example.sql",
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("008_example.sql");
    expect(errors[0]).toContain("COVERED_MIGRATIONS");
  });

  it("fails loudly when the manifest covers a migration that no longer exists", () => {
    const withoutLast = migrationFilesOnDisk().slice(0, -1);
    const errors = findManifestCoverageErrors(withoutLast);
    expect(errors.some((e) => e.includes("does not exist"))).toBe(true);
  });
});

describe("per-column migration ownership", () => {
  it("every table and column is owned by a covered migration", () => {
    const covered = new Set(COVERED_MIGRATIONS);
    for (const [tableName, spec] of Object.entries(EXPECTED_SCHEMA)) {
      expect(covered.has(spec.introducedBy), `${tableName} owner`).toBe(true);
      expect(Object.keys(spec.columns).length, `${tableName} columns`).toBeGreaterThan(0);
      for (const owner of Object.values(spec.columns)) {
        expect(covered.has(owner)).toBe(true);
      }
    }
  });

  it("post-creation columns point at the migration that actually added them", () => {
    // A drift report must say "apply 004/005", not "reapply 002" — these two
    // columns are the documented prod-drift precedent (005 was missing for
    // weeks because table-level ownership hid it).
    expect(EXPECTED_SCHEMA.feed_sources.columns.source_type).toBe(
      "004_offer_change_candidates.sql"
    );
    expect(EXPECTED_SCHEMA.feed_items.columns.hidden_from_homepage).toBe(
      "005_feed_item_homepage_hidden.sql"
    );
    // Non-extended columns inherit their table's creation migration.
    expect(EXPECTED_SCHEMA.feed_items.columns.raw_title).toBe(
      "002_feed_import_queue.sql"
    );
  });
});
