import { createHash } from "node:crypto";

export type MigrationRolloutPhase =
  | "dry-run"
  | "before"
  | "approve-apply"
  | "after";

export interface MigrationRolloutState {
  migration: string;
  beforeHash: string;
  capturedAt: string;
}

export interface MigrationRolloutEvidence {
  migration: string;
  beforeHash: string;
  afterHash: string;
  publicOfferDataUnchanged: boolean;
  schemaProbe: "passed";
  generatedTypes: "passed";
  typecheck: "passed";
  manifestTests: "passed";
  completedAt: string;
}

export function normaliseMigrationFilename(value: string): string {
  const filename = value.trim();
  if (!/^\d{3}_[a-z0-9_]+\.sql$/.test(filename)) {
    throw new Error(
      "Migration must be a filename such as 023_gift_card_accuracy_model.sql."
    );
  }
  return filename;
}

export function approvalPhrase(filename: string): string {
  return `APPROVE ${filename} FOR PRODUCTION`;
}

export function hashOfferRows(
  rows: Array<{ id: string; updated_at: string | null }>
): string {
  const canonical = [...rows]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((row) => `${row.id}\t${row.updated_at ?? ""}`)
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildEvidence(
  state: MigrationRolloutState,
  afterHash: string,
  completedAt: string
): MigrationRolloutEvidence {
  return {
    migration: state.migration,
    beforeHash: state.beforeHash,
    afterHash,
    publicOfferDataUnchanged: state.beforeHash === afterHash,
    schemaProbe: "passed",
    generatedTypes: "passed",
    typecheck: "passed",
    manifestTests: "passed",
    completedAt,
  };
}
