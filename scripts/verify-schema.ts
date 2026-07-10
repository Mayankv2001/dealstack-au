/**
 * Read-only schema-drift probe.
 *
 * Migrations in this project were historically applied to prod by hand and
 * untracked; migration 005's feed_items.hidden_from_homepage column was
 * silently missing from prod for weeks before anyone noticed. This script
 * probes the configured Supabase project for every table/column declared
 * across supabase/migrations/001-007 and fails loudly on any gap, instead of
 * relying on a manual SQL-editor check that gets skipped.
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
 *   0 — schema matches migrations 001-007
 *   1 — drift found (missing table/column) — see report for which migration to apply
 *   2 — config/connection error (missing env, unreachable project, unrecognised error)
 */

import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "../lib/env";

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
      "project and supabase/migrations/001-007.",
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
// When you add a migration, add its tables/columns here — the launch checklist
// runs `npm run verify:schema` to catch drift before it bites again.

const EXPECTED: Record<string, string[]> = {
  // 001_initial_schema.sql
  stores: [
    "id", "name", "category", "logo", "logo_path", "logo_text", "logo_subtext",
    "logo_theme", "discount_percent", "discount_code", "expiry_date",
    "cashback_percent", "cashback_provider", "gift_card_discount_percent",
    "gift_card_source", "points_program", "points_rate", "aliases",
    "is_published", "sort_order", "created_at", "updated_at",
  ],
  gift_card_offers: [
    "id", "brand", "discount_percent", "channel", "source",
    "accepted_at_merchant_ids", "points_on_purchase", "cap_dollars",
    "expiry_date", "start_date", "purchase_location", "purchase_method",
    "limit_per_customer", "accepted_at", "usage_notes", "stack_notes",
    "source_detail_url", "citations", "confidence", "last_checked_at",
    "is_published", "created_at", "updated_at",
  ],
  cashback_offers: [
    "id", "merchant_id", "provider", "rate_percent", "flat_amount",
    "cap_dollars", "is_upsized", "excludes_gift_card_payment", "terms_summary",
    "expiry_date", "citations", "confidence", "last_checked_at",
    "is_published", "created_at", "updated_at",
  ],
  points_offers: [
    "id", "merchant_id", "program", "earn_rate_display", "earn_multiple",
    "point_value_cents", "mechanism", "expiry_date", "citations", "confidence",
    "last_checked_at", "is_published", "created_at", "updated_at",
  ],
  ozbargain_signals: [
    "id", "source_native_id", "merchant_id", "title", "summary",
    "votes_sample", "comment_count", "sentiment", "deal_kind", "source_url",
    "merchant_url", "product_url", "posted_at", "expiry_date", "tags",
    "promo_code", "price_text", "signal_score", "confidence",
    "last_checked_at", "is_sample", "status", "created_at", "updated_at",
  ],
  weekly_deals: [
    "id", "week_of", "merchant_id", "title", "summary", "highlight",
    "component_ids", "citations", "expiry_date", "confidence",
    "is_published", "created_at", "updated_at",
  ],
  admins: ["email", "role", "created_at"],
  audit_log: [
    "id", "actor_email", "action", "table_name", "row_id", "diff", "created_at",
  ],
  // 002_feed_import_queue.sql (+ source_type added in 004, hidden_from_homepage in 005)
  feed_sources: [
    "id", "label", "feed_url", "kind", "merchant_id", "is_enabled", "etag",
    "last_modified", "last_fetched_at", "last_status", "failure_count",
    "next_earliest_fetch_at", "created_at", "updated_at",
    "source_type", // 004_offer_change_candidates.sql
  ],
  feed_items: [
    "id", "feed_source_id", "source_native_id", "link", "raw_title",
    "raw_summary", "categories", "posted_at", "fetched_at", "content_hash",
    "review_state", "promoted_signal_id", "created_at", "updated_at",
    "hidden_from_homepage", // 005_feed_item_homepage_hidden.sql
  ],
  feed_fetch_log: [
    "id", "feed_source_id", "started_at", "finished_at", "http_status",
    "items_seen", "items_new", "error", "created_at",
  ],
  // 003_compliance_review.sql
  compliance_reviews: [
    "id", "source_name", "robots_txt_checked", "terms_checked",
    "feed_paths_allowed", "user_agent_recorded", "rate_limit_recorded",
    "approved_for_monitoring", "reviewer_email", "notes", "reviewed_at",
    "created_at", "updated_at",
  ],
  // 004_offer_change_candidates.sql
  offer_change_candidates: [
    "id", "source_type", "source_name", "merchant_id", "target_id",
    "detected_title", "detected_rate_or_discount", "detected_url",
    "previous_value", "proposed_value", "confidence", "raw_summary",
    "content_hash", "review_state", "reviewed_by", "reviewed_at",
    "created_at", "updated_at",
  ],
  // 006_admin_rate_limits.sql
  admin_rate_limits: ["id", "admin_email", "action_key", "created_at"],
  // 007_card_offers.sql
  card_offers: [
    "id", "provider", "card_name", "offer_type", "bonus_points",
    "cashback_amount", "statement_credit_amount", "minimum_spend",
    "minimum_spend_period", "annual_fee", "eligibility_notes",
    "offer_summary", "source_url", "confidence", "expiry_date",
    "last_checked_at", "is_published", "created_at", "updated_at",
  ],
};

const TABLE_TO_MIGRATION: Record<string, string> = {
  stores: "001_initial_schema.sql",
  gift_card_offers: "001_initial_schema.sql",
  cashback_offers: "001_initial_schema.sql",
  points_offers: "001_initial_schema.sql",
  ozbargain_signals: "001_initial_schema.sql",
  weekly_deals: "001_initial_schema.sql",
  admins: "001_initial_schema.sql",
  audit_log: "001_initial_schema.sql",
  feed_sources: "002_feed_import_queue.sql",
  feed_items: "002_feed_import_queue.sql",
  feed_fetch_log: "002_feed_import_queue.sql",
  compliance_reviews: "003_compliance_review.sql",
  offer_change_candidates: "004_offer_change_candidates.sql",
  admin_rate_limits: "006_admin_rate_limits.sql",
  card_offers: "007_card_offers.sql",
};

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
  const tables = Object.keys(EXPECTED);
  console.log("DealStack AU — verify-schema (read-only probe of migrations 001-007)");
  console.log(`  tables checked: ${tables.length}`);
  console.log("");

  let driftCount = 0;
  let unexpectedCount = 0;

  // Sequential: 15 tables, worst case ~15 + ~30 requests — a few seconds.
  // Simplicity beats parallel here.
  for (const table of tables) {
    const columns = EXPECTED[table];
    const result = await verifyTable(db, table, columns);
    const label = padTable(result.table);

    if (result.ok) {
      console.log(`▸ ${label} OK (${columns.length} columns)`);
      continue;
    }
    if (result.missingTable) {
      driftCount += 1;
      console.log(`▸ ${label} MISSING TABLE (apply ${TABLE_TO_MIGRATION[table]})`);
      continue;
    }
    if (result.missingColumns && result.missingColumns.length > 0) {
      driftCount += 1;
      console.log(
        `▸ ${label} MISSING COLUMNS: ${result.missingColumns.join(", ")} (see ${TABLE_TO_MIGRATION[table]})`
      );
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

  console.log(`schema matches migrations 001–007 (${tables.length} tables OK).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
});
