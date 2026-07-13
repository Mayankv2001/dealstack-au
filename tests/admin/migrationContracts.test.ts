import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = (name: string) =>
  readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

describe("production safety migration contracts", () => {
  it("makes the admin limiter atomic and service-role only", () => {
    const sql = migration("010_atomic_admin_rate_limit.sql");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("grant execute");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("writes admin audits from the same database mutation transaction", () => {
    const sql = migration("011_transactional_admin_audit.sql");
    expect(sql).toContain("after insert or update or delete");
    expect(sql).toContain("insert into public.audit_log");
    expect(sql).toContain("x-dealstack-admin-actor");
  });

  it("keeps correction reports private and unable to publish offers", () => {
    const sql = migration("012_card_offer_correction_reports.sql");
    expect(sql).toContain("enable row level security");
    expect(sql).not.toMatch(/create policy[\s\S]+card_offer_correction_reports/i);
    expect(sql).not.toMatch(/update\s+public\.card_offers/i);
  });

  it("makes queue approval and automated archival transactional and service-role only", () => {
    const sql = migration("015_daily_deal_pipeline.sql");
    expect(sql).toContain("for update");
    expect(sql).toContain("item.content_hash is distinct from p_expected_content_hash");
    expect(sql).toContain("insert into public.ozbargain_signals");
    expect(sql).toContain("status = 'approved'");
    expect(sql).toContain("auto-archive-expired");
    expect(sql).toContain("auto-archive-invalid");
    expect(sql).toContain("insert into public.audit_log");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("locks the daily pipeline to at most one running row at a time", () => {
    const sql = migration("016_pipeline_run_lock.sql");
    expect(sql).toContain("create unique index");
    expect(sql).toContain("daily_pipeline_runs");
    expect(sql).toContain("where status = 'running'");
  });

  it("registers the card-offer source decision without enabling or approving anything", () => {
    const sql = migration("017_card_source_registry.sql");
    // The new feed row must land disabled — a future admin enables it deliberately.
    expect(sql).toMatch(/insert into public\.feed_sources[\s\S]*'category'[\s\S]*'ozbargain'[\s\S]*false/);
    expect(sql).toContain("ozbargain.com.au/tag/credit-card/feed");
    // The Finder review must land as a recorded rejection, not an approval.
    expect(sql).toContain("Finder.com.au");
    expect(sql).toMatch(/insert into public\.compliance_reviews[\s\S]*false,\s*\n\s*'mv2001erma@gmail\.com'/);
    // Both inserts must be guarded so a re-run cannot duplicate the rows.
    expect(sql).toContain("where not exists");
  });

  it("keeps card detections private and structurally constrained", () => {
    const sql = migration("018_card_offer_change_candidates.sql");
    expect(sql).toContain("'card_offer'");
    expect(sql).toContain("payload jsonb not null");
    expect(sql).toContain("jsonb_typeof(payload) = 'object'");
    expect(sql).not.toMatch(/update\s+public\.card_offers/i);
    expect(sql).not.toMatch(/create policy/i);
  });

  it("fences lifecycle cleanup and retention behind service-role functions", () => {
    const sql = migration("019_pipeline_lifecycle_retention.sql");
    expect(sql).toContain(
      "last_validated_at = coalesce(last_checked_at, updated_at, created_at)"
    );
    expect(sql).toContain("review_by_date < p_today");
    expect(sql).toContain("stale-unvalidated");
    expect(sql).toContain("review_state in ('ignored', 'rejected')");
    expect(sql).toContain("auto-purge-retained");
    expect(sql).toContain("run_daily_pipeline_cleanup");
    expect(sql).toContain("stage-detection");
    expect(sql).toContain("trg_audit_system_offer_change_insert");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("archives review items in place only on explicit expired/deleted, never hard-deleting", () => {
    const sql = migration("020_ozb_expiry_recheck.sql");
    // New terminal 'archived' triage state, kept out of the retention purge set.
    expect(sql).toMatch(
      /check \(review_state in \('new', 'imported', 'ignored', 'duplicate', 'rejected', 'archived'\)\)/
    );
    // The archival RPC only ever touches PENDING items and writes an audit row.
    expect(sql).toContain("if item.review_state <> 'new' then return false");
    expect(sql).toContain("review_state = 'archived'");
    expect(sql).toContain("'auto-archive-recheck'");
    expect(sql).toContain("insert into public.audit_log");
    // No hard delete of review records anywhere in this migration.
    expect(sql).not.toMatch(/delete\s+from\s+public\.feed_items/i);
    // Independent one-running lock for the separate recheck cron.
    expect(sql).toContain("idx_ozb_recheck_runs_one_running");
    expect(sql).toContain("where status = 'running'");
    // Archive reasons are constrained to the two EXPLICIT source states only —
    // the "unavailable after N failures" reason must NOT exist.
    expect(sql).toContain("check (archive_reason in ('source_expired', 'source_deleted'))");
    expect(sql).toContain("('source_expired', 'source_deleted')");
    expect(sql).not.toContain("source_unavailable_confirmed");
    // The compliant expiry producers: structured facts captured from the
    // APPROVED feed XML at ingest (no HTML retrieval, no new request shape).
    expect(sql).toContain("declared_expires_at timestamptz");
    expect(sql).toMatch(/source_marked_expired boolean not null default false/);
    // Audit rows record which signal produced each archival.
    expect(sql).toContain("'signal', p_signal");
    // Preview mode is a first-class, default-safe run column.
    expect(sql).toMatch(/dry_run\s+boolean not null default true/);
    // Service-role only.
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("keeps compound gift-card campaigns private and approval fail-closed", () => {
    const sql = migration("023_gift_card_accuracy_model.sql");
    expect(sql).toContain("suboffer_key");
    expect(sql).toContain("compound-summary");
    expect(sql).toContain("split-complete");
    expect(sql).toContain("source_present");
    expect(sql).toContain("source-removed");
    expect(sql).toContain("Stored source identity is required");
    expect(sql).toContain("raw_item.canonical_url !~ '^https://'");
    expect(sql).toContain("gift_card_offers_public_accuracy_check");
    expect(sql).toContain("not valid");
    expect(sql).toContain("Points require a multiplier and programme");
    expect(sql).toContain("Promo credits require a threshold");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("models changing programme catalogues separately from temporary offers", () => {
    const sql = migration("024_gift_card_programmes.sql");
    expect(sql).toContain("gift_card_programmes");
    expect(sql).toContain("gift_card_programme_rates");
    expect(sql).toContain("gift_card_programme_rate_history");
    expect(sql).toContain("product-added");
    expect(sql).toContain("product-removed");
    expect(sql).toContain("rate-increased");
    expect(sql).toContain("rate-decreased");
    expect(sql).toContain("payment_requirement");
    expect(sql).toContain("review_by_date");
    expect(sql).toContain("record_gift_card_programme_rate_history");
    expect(sql).toContain("after insert or update on public.gift_card_programme_rates");
  });

  it("keeps public offer history structured, expired and immutable", () => {
    const sql = migration("025_public_gift_card_offer_history.sql");
    expect(sql).toContain("gift_card_offer_occurrences");
    expect(sql).toContain("end_date < current_date");
    expect(sql).toContain("reject_gift_card_occurrence_mutation");
    expect(sql).not.toContain("raw_payload");
    expect(sql).not.toMatch(/\n\s*comments\s+(text|jsonb?)/);
  });

  it("accepts public correction reports only through a rate-limited RPC", () => {
    const sql = migration("026_public_correction_reports.sql");
    expect(sql).toContain("submit_public_correction");
    expect(sql).toContain("v_recent >= 5");
    expect(sql).toContain("No public policies");
    expect(sql).toContain("gift-card-acceptance");
  });

  it("keeps email alerts private, double-opt-in and disabled outside application flags", () => {
    const sql = migration("027_email_alerts.sql");
    expect(sql).toContain("email_alert_subscriptions");
    expect(sql).toContain("status in ('pending', 'active', 'unsubscribed', 'bounced')");
    expect(sql).toContain("confirmation_token_hash");
    expect(sql).toContain("unsubscribe_token_hash");
    expect(sql).toContain("email_alert_outbox");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("consume_email_alert_request_limit");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("request_email_alert_subscription");
    expect(sql).toContain("claimed_at < now() - interval '15 minutes'");
    expect(sql).toContain("prune_email_alert_data");
    expect(sql).toContain("status in ('unsubscribed', 'bounced')");
    expect(sql).toContain("No public policies");
  });
});
