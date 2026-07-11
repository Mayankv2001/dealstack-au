/**
 * Expected production schema manifest — pure, no I/O, no env.
 *
 * Single source of truth for what `npm run verify:schema`
 * (scripts/verify-schema.ts) probes, with PER-COLUMN migration ownership so a
 * drift report names the migration that actually added the missing column —
 * not just the migration that created the table. (A table created in 002 and
 * extended in 004/005 must report 004/005 for those columns, or the operator
 * is told to reapply the wrong file.)
 *
 * SELF-AUDIT: `findManifestCoverageErrors()` is exercised by
 * tests/admin/schemaManifest.test.ts against the real contents of
 * supabase/migrations/, so adding a migration file without registering its
 * tables/columns here fails `npm run test:admin` before it can merge. That
 * test is what keeps a green scheduled probe from becoming falsely reassuring.
 *
 * When you add a migration:
 *   1. append its filename to COVERED_MIGRATIONS;
 *   2. add its new tables here (introducedBy = that filename), or add its new
 *      columns to existing tables with the new filename as the column owner.
 */

export interface ExpectedTable {
  /** Migration file that CREATEs the table. */
  introducedBy: string;
  /** Column name → migration file that added it. */
  columns: Record<string, string>;
}

/** Every migration file the manifest below claims to cover, in order. */
export const COVERED_MIGRATIONS: readonly string[] = [
  "001_initial_schema.sql",
  "002_feed_import_queue.sql",
  "003_compliance_review.sql",
  "004_offer_change_candidates.sql",
  "005_feed_item_homepage_hidden.sql",
  "006_admin_rate_limits.sql",
  "007_card_offers.sql",
  "008_pin_function_search_path.sql",
  "009_card_offer_lifecycle.sql",
  "010_atomic_admin_rate_limit.sql",
  "011_transactional_admin_audit.sql",
  "012_card_offer_correction_reports.sql",
  // Grants-only (revokes EXECUTE on the 009/011 trigger functions) — no
  // schema shape change, so no EXPECTED_SCHEMA entry, same as 008.
  "013_revoke_trigger_function_execute.sql",
  "014_signal_product_group.sql",
  "015_daily_deal_pipeline.sql",
  // Index-only (adds the one-running-row lock on daily_pipeline_runs) — no
  // schema shape change, same as 008 and 013.
  "016_pipeline_run_lock.sql",
];

/** Builds a table entry whose columns default to the table's own migration. */
function table(
  introducedBy: string,
  columns: string[],
  columnOverrides: Record<string, string> = {}
): ExpectedTable {
  const owned: Record<string, string> = {};
  for (const column of columns) owned[column] = introducedBy;
  for (const [column, owner] of Object.entries(columnOverrides)) {
    owned[column] = owner;
  }
  return { introducedBy, columns: owned };
}

export const EXPECTED_SCHEMA: Record<string, ExpectedTable> = {
  // 001_initial_schema.sql
  stores: table("001_initial_schema.sql", [
    "id", "name", "category", "logo", "logo_path", "logo_text", "logo_subtext",
    "logo_theme", "discount_percent", "discount_code", "expiry_date",
    "cashback_percent", "cashback_provider", "gift_card_discount_percent",
    "gift_card_source", "points_program", "points_rate", "aliases",
    "is_published", "sort_order", "created_at", "updated_at",
  ]),
  gift_card_offers: table("001_initial_schema.sql", [
    "id", "brand", "discount_percent", "channel", "source",
    "accepted_at_merchant_ids", "points_on_purchase", "cap_dollars",
    "expiry_date", "start_date", "purchase_location", "purchase_method",
    "limit_per_customer", "accepted_at", "usage_notes", "stack_notes",
    "source_detail_url", "citations", "confidence", "last_checked_at",
    "is_published", "created_at", "updated_at",
  ]),
  cashback_offers: table("001_initial_schema.sql", [
    "id", "merchant_id", "provider", "rate_percent", "flat_amount",
    "cap_dollars", "is_upsized", "excludes_gift_card_payment", "terms_summary",
    "expiry_date", "citations", "confidence", "last_checked_at",
    "is_published", "created_at", "updated_at",
  ]),
  points_offers: table("001_initial_schema.sql", [
    "id", "merchant_id", "program", "earn_rate_display", "earn_multiple",
    "point_value_cents", "mechanism", "expiry_date", "citations", "confidence",
    "last_checked_at", "is_published", "created_at", "updated_at",
  ]),
  // 001_initial_schema.sql — extended by 014 (product_group).
  ozbargain_signals: table(
    "001_initial_schema.sql",
    [
      "id", "source_native_id", "merchant_id", "title", "summary",
      "votes_sample", "comment_count", "sentiment", "deal_kind", "source_url",
      "merchant_url", "product_url", "posted_at", "expiry_date", "tags",
      "promo_code", "price_text", "signal_score", "confidence",
      "last_checked_at", "is_sample", "status", "created_at", "updated_at",
      "product_group", "archived_at", "archive_reason", "last_validated_at",
    ],
    {
      product_group: "014_signal_product_group.sql",
      archived_at: "015_daily_deal_pipeline.sql",
      archive_reason: "015_daily_deal_pipeline.sql",
      last_validated_at: "015_daily_deal_pipeline.sql",
    }
  ),
  weekly_deals: table("001_initial_schema.sql", [
    "id", "week_of", "merchant_id", "title", "summary", "highlight",
    "component_ids", "citations", "expiry_date", "confidence",
    "is_published", "created_at", "updated_at",
  ]),
  admins: table("001_initial_schema.sql", ["email", "role", "created_at"]),
  audit_log: table("001_initial_schema.sql", [
    "id", "actor_email", "action", "table_name", "row_id", "diff", "created_at",
  ]),
  // 002_feed_import_queue.sql — extended by 004 (source_type) and 005
  // (hidden_from_homepage); the overrides keep drift reports actionable.
  feed_sources: table(
    "002_feed_import_queue.sql",
    [
      "id", "label", "feed_url", "kind", "merchant_id", "is_enabled", "etag",
      "last_modified", "last_fetched_at", "last_status", "failure_count",
      "next_earliest_fetch_at", "created_at", "updated_at", "source_type",
    ],
    { source_type: "004_offer_change_candidates.sql" }
  ),
  feed_items: table(
    "002_feed_import_queue.sql",
    [
      "id", "feed_source_id", "source_native_id", "link", "raw_title",
      "raw_summary", "categories", "posted_at", "fetched_at", "content_hash",
      "review_state", "promoted_signal_id", "created_at", "updated_at",
      "hidden_from_homepage", "thumbnail_url", "reviewed_at", "reviewed_by",
    ],
    {
      hidden_from_homepage: "005_feed_item_homepage_hidden.sql",
      thumbnail_url: "015_daily_deal_pipeline.sql",
      reviewed_at: "015_daily_deal_pipeline.sql",
      reviewed_by: "015_daily_deal_pipeline.sql",
    }
  ),
  feed_fetch_log: table("002_feed_import_queue.sql", [
    "id", "feed_source_id", "started_at", "finished_at", "http_status",
    "items_seen", "items_new", "error", "created_at", "items_skipped",
    "items_updated",
  ], {
    items_skipped: "015_daily_deal_pipeline.sql",
    items_updated: "015_daily_deal_pipeline.sql",
  }),
  // 003_compliance_review.sql
  compliance_reviews: table("003_compliance_review.sql", [
    "id", "source_name", "robots_txt_checked", "terms_checked",
    "feed_paths_allowed", "user_agent_recorded", "rate_limit_recorded",
    "approved_for_monitoring", "reviewer_email", "notes", "reviewed_at",
    "created_at", "updated_at",
  ]),
  // 004_offer_change_candidates.sql
  offer_change_candidates: table("004_offer_change_candidates.sql", [
    "id", "source_type", "source_name", "merchant_id", "target_id",
    "detected_title", "detected_rate_or_discount", "detected_url",
    "previous_value", "proposed_value", "confidence", "raw_summary",
    "content_hash", "review_state", "reviewed_by", "reviewed_at",
    "created_at", "updated_at",
  ]),
  // 006_admin_rate_limits.sql
  admin_rate_limits: table("006_admin_rate_limits.sql", [
    "id", "admin_email", "action_key", "created_at",
  ]),
  // 007_card_offers.sql
  card_offers: table("007_card_offers.sql", [
    "id", "provider", "card_name", "offer_type", "bonus_points",
    "cashback_amount", "statement_credit_amount", "minimum_spend",
    "minimum_spend_period", "annual_fee", "eligibility_notes",
    "offer_summary", "source_url", "confidence", "expiry_date",
    "last_checked_at", "is_published", "created_at", "updated_at",
    "review_by_date", "bonus_stages", "point_value_cents", "is_archived",
    "archived_at",
  ], {
    review_by_date: "009_card_offer_lifecycle.sql",
    bonus_stages: "009_card_offer_lifecycle.sql",
    point_value_cents: "009_card_offer_lifecycle.sql",
    is_archived: "009_card_offer_lifecycle.sql",
    archived_at: "009_card_offer_lifecycle.sql",
  }),
  card_offer_history: table("009_card_offer_lifecycle.sql", [
    "id", "card_offer_id", "change_summary", "changed_fields", "checked_at",
    "created_at",
  ]),
  card_offer_correction_reports: table("012_card_offer_correction_reports.sql", [
    "id", "card_offer_id", "reported_offer_label", "reason", "details",
    "status", "reviewed_by", "reviewed_at", "created_at", "updated_at",
  ]),
  correction_report_rate_limits: table("012_card_offer_correction_reports.sql", [
    "id", "request_fingerprint", "created_at",
  ]),
  daily_pipeline_runs: table("015_daily_deal_pipeline.sql", [
    "id", "started_at", "finished_at", "status", "expired_archived",
    "invalid_archived", "validation_checked", "validation_unknown",
    "feeds_processed", "items_fetched", "items_new",
    "items_updated", "items_skipped", "errors", "created_at",
  ]),
};

/**
 * Pure coverage validator: given the actual `*.sql` filenames present in
 * supabase/migrations/, returns every way the manifest and the directory
 * disagree. An empty array means the manifest fully covers the committed
 * migrations. No SQL is parsed — the point is to force the next migration's
 * author to declare its tables/columns in the same PR, where a reviewer can
 * compare the declaration against the SQL.
 */
export function findManifestCoverageErrors(
  migrationFiles: readonly string[]
): string[] {
  const errors: string[] = [];
  const covered = new Set(COVERED_MIGRATIONS);
  const onDisk = new Set(migrationFiles);

  for (const file of migrationFiles) {
    if (!covered.has(file)) {
      errors.push(
        `migration ${file} is not registered in COVERED_MIGRATIONS — add it and declare its tables/columns in EXPECTED_SCHEMA (scripts/schema-manifest.ts)`
      );
    }
  }
  for (const file of COVERED_MIGRATIONS) {
    if (!onDisk.has(file)) {
      errors.push(
        `COVERED_MIGRATIONS lists ${file}, which does not exist in supabase/migrations — remove the stale entry or restore the file`
      );
    }
  }

  for (const [tableName, spec] of Object.entries(EXPECTED_SCHEMA)) {
    if (!spec.introducedBy) {
      errors.push(`table ${tableName} has no introducedBy migration owner`);
    } else if (!covered.has(spec.introducedBy)) {
      errors.push(
        `table ${tableName} is owned by ${spec.introducedBy}, which is not in COVERED_MIGRATIONS`
      );
    }
    const columnNames = Object.keys(spec.columns);
    if (columnNames.length === 0) {
      errors.push(`table ${tableName} declares no columns`);
    }
    for (const [column, owner] of Object.entries(spec.columns)) {
      if (!column.trim()) {
        errors.push(`table ${tableName} declares an empty column name`);
      }
      if (!owner) {
        errors.push(`column ${tableName}.${column} has no owning migration`);
      } else if (!covered.has(owner)) {
        errors.push(
          `column ${tableName}.${column} is owned by ${owner}, which is not in COVERED_MIGRATIONS`
        );
      }
    }
  }

  return errors;
}
