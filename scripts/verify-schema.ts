/**
 * Read-only schema-drift probe.
 *
 * Migrations in this project were historically applied to prod by hand and
 * untracked; migration 005's feed_items.hidden_from_homepage column was
 * silently missing from prod for weeks before anyone noticed. This script
 * probes the configured Supabase project for every table/column declared in
 * scripts/schema-manifest.ts (which tests/admin/schemaManifest.test.ts keeps
 * in lock-step with supabase/migrations/) and fails loudly on any gap,
 * instead of relying on a manual SQL-editor check that gets skipped.
 *
 * WHY NOT information_schema: supabase-js talks to Supabase via PostgREST,
 * which only exposes the `public` schema — db.from("information_schema.columns")
 * does not work. Instead this probes each table with an explicit column list
 * (`select(columns).limit(0)`), which Postgres validates server-side without
 * transferring any row data.
 *
 * SAFETY
 *   - Purely read-only: no .update(/.insert(/.upsert(/.delete(/.rpc( anywhere.
 *   - No --write / --apply-missing flag exists or ever should. Drift is
 *     always fixed by hand-reviewing and applying a migration file.
 *   - Service-role key required (staging tables have no anon SELECT policy;
 *     the anon key would misreport RLS denials as drift). Never logged.
 *
 * Required env (.env.local, same as `npm run seed` / `npm run cleanup:old-deals`):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:
 *   npm run verify:schema
 *
 * Exit codes:
 *   0 — schema matches every covered migration
 *   1 — drift found (missing table/column) — see report for which migration to apply
 *   2 — config/connection error (missing env, unreachable project, unrecognised error)
 */

import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "../lib/env";
import { COVERED_MIGRATIONS, EXPECTED_SCHEMA } from "./schema-manifest";

// Load .env.local for standalone runs (Next loads it for the app, scripts don't).
type WithLoadEnv = { loadEnvFile?: (path?: string) => void };
try {
  (process as unknown as WithLoadEnv).loadEnvFile?.(".env.local");
} catch {
  // .env.local not found — fall back to shell-provided environment variables.
}

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(
    [
      "verify-schema — read-only probe for drift between the configured Supabase",
      `project and the ${COVERED_MIGRATIONS.length} covered migrations (scripts/schema-manifest.ts).`,
      "",
      "  npm run verify:schema",
      "",
      "Prints one OK/FAIL line per manifest table. Exit codes: 0 clean, 1 drift",
      "found, 2 config/connection error. Never modifies the database.",
    ].join("\n")
  );
  process.exit(0);
}

// ── Manifest ─────────────────────────────────────────────────────────────────
// The expected tables/columns live in scripts/schema-manifest.ts with
// per-column migration ownership; tests/admin/schemaManifest.test.ts fails the
// suite when a committed migration is missing from that manifest, so this
// probe cannot silently under-cover new migrations.

// ── Env (fail before creating any client — zero network calls on config error) ─

let url: string;
let serviceRoleKey: string;
try {
  url = supabaseUrl();
  serviceRoleKey = supabaseServiceRoleKey();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
}

const db: SupabaseClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Probe logic ──────────────────────────────────────────────────────────────

interface TableResult {
  table: string;
  ok: boolean;
  missingTable?: boolean;
  missingColumns?: string[];
  unexpectedErrors?: string[];
}

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);
const MISSING_TABLE_MESSAGE_RE = /could not find the table|relation .* does not exist/i;
const MISSING_COLUMN_CODES = new Set(["42703"]);
const MISSING_COLUMN_MESSAGE_RE = /column .* does not exist/i;

function looksLikeMissingTable(error: PostgrestError): boolean {
  return (
    (!!error.code && MISSING_TABLE_CODES.has(error.code)) ||
    MISSING_TABLE_MESSAGE_RE.test(error.message)
  );
}

function looksLikeMissingColumn(error: PostgrestError): boolean {
  return (
    (!!error.code && MISSING_COLUMN_CODES.has(error.code)) ||
    MISSING_COLUMN_MESSAGE_RE.test(error.message)
  );
}

async function verifyTable(
  client: SupabaseClient,
  table: string,
  columns: string[]
): Promise<TableResult> {
  const { error } = await client.from(table).select(columns.join(",")).limit(0);
  if (!error) return { table, ok: true };

  if (looksLikeMissingTable(error)) {
    return { table, ok: false, missingTable: true };
  }

  // Batch error only names the first missing column — re-probe one at a time
  // to enumerate every gap in this table.
  const missingColumns: string[] = [];
  const unexpectedErrors: string[] = [];
  for (const column of columns) {
    const { error: colError } = await client.from(table).select(column).limit(0);
    if (!colError) continue;
    if (looksLikeMissingColumn(colError)) {
      missingColumns.push(column);
    } else {
      unexpectedErrors.push(`${column}: ${colError.message}`);
    }
  }

  if (missingColumns.length === 0 && unexpectedErrors.length === 0) {
    // The whole-table probe failed but no per-column probe reproduced it —
    // report the original error verbatim rather than mislabelling it as drift.
    unexpectedErrors.push(error.message);
  }

  return {
    table,
    ok: false,
    missingColumns: missingColumns.length > 0 ? missingColumns : undefined,
    unexpectedErrors: unexpectedErrors.length > 0 ? unexpectedErrors : undefined,
  };
}

// ── Report + exit ────────────────────────────────────────────────────────────

function padTable(name: string): string {
  return name.length >= 30 ? `${name} ` : name.padEnd(30);
}

async function main(): Promise<void> {
  const tables = Object.keys(EXPECTED_SCHEMA);
  console.log(
    `DealStack AU — verify-schema (read-only probe of ${COVERED_MIGRATIONS.length} covered migrations)`
  );
  console.log(`  tables checked: ${tables.length}`);
  console.log("");

  let driftCount = 0;
  let unexpectedCount = 0;

  // Sequential: 15 tables, worst case ~15 + ~30 requests — a few seconds.
  // Simplicity beats parallel here.
  for (const table of tables) {
    const spec = EXPECTED_SCHEMA[table];
    const columns = Object.keys(spec.columns);
    const result = await verifyTable(db, table, columns);
    const label = padTable(result.table);

    if (result.ok) {
      console.log(`▸ ${label} OK (${columns.length} columns)`);
      continue;
    }
    if (result.missingTable) {
      driftCount += 1;
      console.log(`▸ ${label} MISSING TABLE (apply ${spec.introducedBy})`);
      continue;
    }
    if (result.missingColumns && result.missingColumns.length > 0) {
      driftCount += 1;
      // Per-column ownership: name the migration that ADDED each missing
      // column, not just the table's creation migration.
      const detail = result.missingColumns
        .map((c) => `${c} (apply ${spec.columns[c] ?? spec.introducedBy})`)
        .join(", ");
      console.log(`▸ ${label} MISSING COLUMNS: ${detail}`);
    }
    if (result.unexpectedErrors && result.unexpectedErrors.length > 0) {
      unexpectedCount += 1;
      console.log(`▸ ${label} UNEXPECTED ERROR: ${result.unexpectedErrors.join("; ")}`);
    }
  }

  console.log("──────────────────────────────");

  if (unexpectedCount > 0) {
    console.log(
      `UNEXPECTED ERRORS: ${unexpectedCount} table(s) returned an error that isn't a ` +
        "recognised missing-table/column signature — check connectivity, project " +
        "status, and the service-role key before assuming schema drift."
    );
    process.exit(2);
  }

  if (driftCount > 0) {
    console.log(`DRIFT FOUND: ${driftCount} table(s) affected. Apply the migrations above, then re-run.`);
    process.exit(1);
  }

  console.log(
    `schema matches all ${COVERED_MIGRATIONS.length} covered migrations (${tables.length} tables OK).`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
});
