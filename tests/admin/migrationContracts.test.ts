import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COVERED_MIGRATIONS, EXPECTED_SCHEMA } from "../../scripts/schema-manifest";

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

  it("archives EVERY time-limited offer type on the Sydney date with an audit row, never deleting", () => {
    const sql = migration("019_pipeline_lifecycle_retention.sql");
    // The daily archival cleanup (invoked by the authenticated monitor-feeds
    // cron) unpublishes each published offer type strictly after its Sydney
    // expiry day — `expiry_date < p_today`, so an offer is live THROUGH its
    // expiry day and archived the next day. Every table is covered.
    for (const table of [
      "gift_card_offers",
      "cashback_offers",
      "points_offers",
      "weekly_deals",
    ]) {
      expect(sql).toMatch(
        new RegExp(`update public\\.${table} set is_published = false[\\s\\S]*?expiry_date < p_today`),
      );
    }
    // card_offers archive both on expiry and on an overdue review-by date.
    expect(sql).toMatch(
      /update public\.card_offers[\s\S]*?is_published = false, is_archived = true[\s\S]*?expiry_date < p_today or review_by_date < p_today/,
    );
    // ozbargain signals move to status='expired', never deleted.
    expect(sql).toMatch(
      /update public\.ozbargain_signals[\s\S]*?status = 'expired'[\s\S]*?expiry_date < p_today/,
    );
    // Scenario 13 — every archival writes an audit_log row (lineage preserved).
    expect(sql).toContain("insert into public.audit_log");
    expect(sql).toContain("'auto-archive-expired'");
    expect(sql).toContain("'auto-archive-card'");
    // Idempotent + non-destructive: the archival branches only ever UPDATE
    // publication/status flags; they never DELETE offer rows.
    expect(sql).not.toMatch(/delete\s+from\s+public\.(gift_card_offers|cashback_offers|points_offers|card_offers|weekly_deals|ozbargain_signals)/i);
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
    expect(sql).toContain("Points require exactly one of multiplier or fixed points, plus a programme");
    expect(sql).toContain("fixed_points");
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
    expect(sql).toContain("fixed_points");
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

  it("registers Point Hacks as a disabled, permission-gated HTML source", () => {
    const sql = migration("027_point_hacks_weekly_gift_cards.sql");
    expect(sql).toContain("'rss', 'atom', 'api', 'html'");
    expect(sql).toContain("pointhacks_weekly_gift_cards");
    expect(sql).toContain("'html', false, false, null, null");
    expect(sql).not.toMatch(/is_published\s*=\s*true/i);
    expect(sql).not.toMatch(/automated_fetch_allowed[^;]*true/i);
  });

  it("keeps acceptance review publication resolved, transactional and evidence-safe", () => {
    const sql = migration("028_gift_card_acceptance_extensions.sql");
    expect(sql).toContain("gift_card_acceptance_candidates");
    expect(sql).toContain("jsonb_typeof(proposed_values) = 'object'");
    expect(sql).toContain("Only resolved acceptance candidates may be approved.");
    expect(sql).toContain("An acceptance update target must be prelinked to the candidate.");
    expect(sql).toContain("Weaker or older reviewed evidence cannot overwrite a public acceptance row.");
    expect(sql).toContain("gift_card_acceptance_evidence");
    expect(sql).toContain("Gift-card acceptance evidence is append-only.");
    expect(sql).toContain("is_public = true and review_state = 'approved'");
    expect(sql).toContain("A safe HTTPS evidence URL is required.");
    expect(sql).toContain("A store, merchant, category or MCC identity is required.");
    expect(sql).toContain("acceptance_evidence_source_type");
    expect(sql).toContain("approve_gift_card_acceptance_removal");
    expect(sql).toContain("Removal status must be confirmed-not-accepted or requires-verification.");
    expect(sql).toContain("for update");
    expect(sql).toContain("insert into public.audit_log");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("idx_gc_acceptance_dedupe_store");
    expect(sql).toContain("idx_gc_acceptance_dedupe_unresolved");
  });

  it("keeps predictions isolated and re-closes their source gates on a re-run", () => {
    const sql = migration("029_gift_card_predictions.sql");
    expect(sql).toContain("gift_card_offer_predictions");
    expect(sql).toContain("enable row level security");
    expect(sql).not.toMatch(/create policy[\s\S]+gift_card_offer_predictions/i);
    expect(sql).toContain("enabled = false");
    expect(sql).toContain("automated_fetch_allowed = false");
    expect(sql).not.toMatch(/on conflict[\s\S]*terms_checked_at\s*=\s*null/i);
    expect(sql).not.toMatch(/on conflict[\s\S]*robots_checked_at\s*=\s*null/i);
    expect(sql).toContain("trg_gc_predictions_updated_at");
    expect(sql).toContain("https://gcdb.com.au/predictions/");
    expect(sql).not.toContain("/resources/gift-card-offer-predictions/");
    expect(sql).toContain("fingerprint            text generated always as");
    expect(sql).toContain(") stored not null");
    expect(sql).toContain("unique (source_id, fingerprint)");
    expect(sql).toContain("normalise_gift_card_prediction_identity_text");
    expect(sql).toContain("gift_card_prediction_fingerprint");
    expect(sql).not.toContain("coalesce(starts_at::text, '')");
    expect(sql).not.toContain("coalesce(ends_at::text, '')");
    expect(sql).toContain("pg_catalog.date_part('year', starts_at)");
    expect(sql).toContain("pg_catalog.date_part('month', ends_at)");
    expect(sql).toContain("trg_gc_predictions_immutable_facts");
    expect(sql).toContain("Original gift-card prediction facts are immutable.");
    expect(sql).toContain("source_marker");
    expect(sql).toContain("predicted_promotion_text");
    expect(sql).toContain("on delete restrict");
    expect(sql).not.toMatch(/insert\s+into\s+public\.gift_card_offers/i);
  });

  it("scopes running jobs by source/kind and fences offer-truth mutators", () => {
    const sql = migration("030_gift_card_job_runs.sql");
    expect(sql).toContain("run_kind text not null default 'ingest'");
    expect(sql).toContain("idx_gc_job_runs_one_running_per_kind");
    expect(sql).toMatch(/unique index[\s\S]*on public\.gift_card_ingest_runs \(source_id, run_kind\)[\s\S]*where status = 'running'/i);
    expect(sql).toContain("idx_gc_job_runs_mutation_fence");
    expect(sql).toMatch(/run_kind in \('reconcile', 'activate-archive'\)/i);
    expect(sql).toContain("drop index if exists public.idx_gc_ingest_runs_one_running");
    expect(sql).toContain("idx_gc_ingest_runs_kind");
    expect(sql).toMatch(/idx_gc_ingest_runs_kind[\s\S]*\(source_id, run_kind, started_at desc\)/i);
    expect(sql).toContain("lease_expires_at timestamptz");
    expect(sql).toContain("create or replace function public.acquire_gift_card_job_run");
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock(216030)");
    expect(sql).toMatch(/lease_expires_at <= p_started_at[\s\S]*source_id = p_source_id and run_kind = p_run_kind/i);
    expect(sql).toMatch(/p_run_kind in \('reconcile', 'activate-archive'\)[\s\S]*run_kind in \('reconcile', 'activate-archive'\)/i);
    expect(sql).toContain("when unique_violation then");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("runs Sydney lifecycle transitions transactionally and service-role only", () => {
    const sql = migration("032_gift_card_lifecycle_orchestration.sql");
    expect(sql).toContain("lifecycle_state");
    expect(sql).toContain("approved-future");
    expect(sql).toContain("apply_gift_card_offer_lifecycle");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("candidate.review_status = 'approved'");
    expect(sql).toContain("candidate.approved_offer_id = offer.id");
    expect(sql).toContain("enforce_gift_card_offer_approval_lineage");
    expect(sql).toContain("deferrable initially deferred");
    expect(sql).toContain("Pipeline-linked gift-card offers without approved lineage block migration 032");
    expect(sql).toContain("Approved pipeline lineage cannot be removed");
    expect(sql).toContain("for update of offer");
    expect(sql).toContain("insert into public.gift_card_offer_occurrences");
    expect(sql).toContain("insert into public.audit_log");
    expect(sql).toContain("on conflict do nothing");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql.match(/exception when others/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("'step', 'activate'");
    expect(sql).toContain("'step', 'archive'");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).not.toMatch(/delete\s+from\s+public\.gift_card/i);
    expect(sql).toContain("drop constraint if exists gift_card_offers_public_accuracy_check");
    expect(sql).toMatch(/gift_card_offers_public_accuracy_check[\s\S]*not valid/i);
  });

  it("hardens reviewed gift-card approval identity and public visibility forward-only", () => {
    const sql = migration("033_gift_card_offer_approval_hardening.sql");

    expect(sql).toContain("requires\n-- 031 (fixed_points convergence) and 032");
    expect(sql).toContain("gift_card_offers_reviewed_lifecycle_check");
    expect(sql).toMatch(/gift_card_offers_reviewed_lifecycle_check[\s\S]*not valid/i);
    expect(sql).toContain("gift_card_offers_fee_waiver_value_check");
    expect(sql).toContain('drop policy if exists "public read published gift_card_offers"');
    expect(sql).toContain('create policy "public read current confirmed gift_card_offers"');
    expect(sql).toContain("confidence = 'confirmed'");
    expect(sql).toContain("lifecycle_state = 'active'");
    expect(sql).toContain("Australia/Sydney");

    expect(sql).toContain("guard_gift_card_offer_publication_lineage");
    expect(sql).toContain("A new public or approved-future gift-card offer requires reviewed candidate lineage");
    expect(sql).toContain("source_candidate_id is null");
    expect(sql).toContain("old.source_candidate_id is null");

    expect(sql).toContain("create or replace function public.approve_gift_card_candidate");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("for update");
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql).toContain("candidate.approved_offer_id <> v_offer_id");
    expect(sql).toContain("existing_offer.source_id is distinct from candidate.source_id");
    expect(sql).toContain("existing_offer.source_raw_item_id is distinct from candidate.raw_item_id");
    expect(sql).toContain("existing_offer.source_suboffer_key is distinct from candidate.suboffer_key");
    expect(sql).toContain("The selected offer ID belongs to unrelated source lineage");

    expect(sql).toContain("candidate.review_status = 'approved'");
    expect(sql).toContain("return v_offer_id");
    expect(sql).toContain("Publication requires confirmed reviewed evidence");
    expect(sql).toContain("raw_item.processing_status is distinct from 'parsed'");
    expect(sql).toContain("Only a successfully parsed source item may be approved");
    expect(sql).toContain("An expired candidate cannot be approved");
    expect(sql).toContain("then 'approved-future'");
    expect(sql).toContain("else 'active'");
    expect(sql).toContain("is_published = true");
    expect(sql).toContain("insert into public.audit_log");
    expect(sql).toContain("'lifecycleState', v_lifecycle_state");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).not.toMatch(/delete\s+from\s+public\./i);

    expect(COVERED_MIGRATIONS).toContain(
      "033_gift_card_offer_approval_hardening.sql",
    );

    // The public policy carries the upcoming arm: reviewed approved-future
    // offers stay publicly readable (carousel/grid/detail upcoming tier),
    // bounded by expiry and candidate lineage rather than cron activation.
    expect(sql).toContain("lifecycle_state = 'approved-future'");
    expect(sql).toContain("source_candidate_id is not null");
  });

  it("persists reviewed structured purchase limits through the approval boundary", () => {
    const sql = migration("035_gift_card_purchase_limits_persistence.sql");

    // Same hardened RPC surface as 033 — nothing loosened by the re-issue.
    expect(sql).toContain("Requires 033");
    expect(sql).toContain("create or replace function public.approve_gift_card_candidate");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("for update");
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql).toContain("Publication requires confirmed reviewed evidence");
    expect(sql).toContain("An expired candidate cannot be approved");
    expect(sql).toContain("then 'approved-future'");
    expect(sql).toContain("insert into public.audit_log");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).not.toMatch(/delete\s+from\s+public\./i);

    // The one addition: validated jsonb purchase limits written on both the
    // insert and the conflict-update arm; a malformed payload is an explicit
    // error, never a silently dropped condition.
    expect(sql).toContain("v_purchase_limits := p_offer->'purchase_limits'");
    expect(sql).toContain("Structured purchase limits must be an object of named limits");
    expect(sql).toContain("purchase_limits = excluded.purchase_limits");

    expect(COVERED_MIGRATIONS).toContain(
      "035_gift_card_purchase_limits_persistence.sql",
    );
  });

  it("adds a Sydney-inclusive expiry bound to the remaining public-read policies", () => {
    const sql = migration("036_offer_expiry_read_policies.sql");

    // Policy-only, forward, tightening: no writes, no deletes, no new grants.
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+(into\s+)?public\./i);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);

    // Every remaining public offer table gains the SAME Sydney-date bound as
    // card_offers (009) and gift_card_offers (033): inclusive on the expiry
    // day, NULL expiry stays evergreen, DST-correct via Australia/Sydney.
    for (const table of [
      "cashback_offers",
      "points_offers",
      "weekly_deals",
      "ozbargain_signals",
    ]) {
      expect(sql).toContain(`public read current ${table}`);
    }
    // Old publication-only policies are replaced, not left shadowing.
    expect(sql).toContain('drop policy if exists "public read published cashback_offers"');
    expect(sql).toContain('drop policy if exists "public read published points_offers"');
    expect(sql).toContain('drop policy if exists "public read published weekly_deals"');
    expect(sql).toContain('drop policy if exists "public read approved ozbargain_signals"');

    // Inclusive-on-the-day bound + evergreen NULL, DST-correct.
    expect(
      sql.match(/expiry_date >= \(\s*pg_catalog\.statement_timestamp\(\) at time zone 'Australia\/Sydney'\s*\)::date/g)?.length ?? 0
    ).toBe(4);
    expect(
      sql.match(/expiry_date is null/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(4);
    // ozbargain keeps its approved gate; the others keep is_published.
    expect(sql).toContain("status = 'approved'");
    expect(
      sql.match(/is_published = true/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(3);

    expect(COVERED_MIGRATIONS).toContain("036_offer_expiry_read_policies.sql");
  });

  it("aligns the card-offer read bound to Australia/Sydney without changing visibility", () => {
    const sql = migration("037_card_offer_sydney_expiry_bound.sql");

    // Policy-only, forward, visibility-neutral: no writes, deletes or grants.
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+(into\s+)?public\./i);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);

    // The last Australia/Melbourne expression in the schema is retired: both the
    // offer policy and its history mirror must move to Australia/Sydney. Only
    // EXECUTABLE SQL matters — the header comment quotes the old expression to
    // explain the swap, so strip `--` comments before the negative assertions.
    const executable = sql.replace(/--[^\n]*/g, "");
    expect(executable).not.toMatch(/at time zone 'Australia\/Melbourne'/);
    expect(executable).not.toMatch(/\bnow\(\) at time zone\b/);

    expect(sql).toContain('create policy "public read current published card_offers"');
    expect(sql).toContain('create policy "public read history for published card offers"');

    // Same inclusive-on-the-day semantics as 033/036, DST-correct, and the
    // per-statement clock rather than transaction-start now().
    expect(
      executable.match(/statement_timestamp\(\) at time zone 'Australia\/Sydney'/g)?.length ?? 0,
    ).toBe(4);
    expect(sql.match(/expiry_date is null/g)?.length ?? 0).toBe(2);
    // The non-expiry gates are preserved verbatim, not loosened.
    expect(sql.match(/is_archived = false/g)?.length ?? 0).toBe(2);
    expect(sql.match(/confidence = 'confirmed'/g)?.length ?? 0).toBe(2);
    expect(sql.match(/review_by_date >=/g)?.length ?? 0).toBe(2);

    expect(COVERED_MIGRATIONS).toContain("037_card_offer_sydney_expiry_bound.sql");
  });

  it("forward-corrects occurrence identity and Sydney date semantics", () => {
    const sql = migration("032_gift_card_lifecycle_orchestration.sql");
    expect(sql).toContain("gift_card_offer_occurrences_end_date_sydney_check");
    expect(sql).toContain("pg_catalog.pg_get_constraintdef");
    expect(sql).toContain("like '%END_DATE < CURRENT_DATE%'");
    expect(sql).toContain("pg_catalog.timezone('Australia/Sydney', sealed_at)::date");
    expect(sql).toContain("gift_card_programmes_public_shape_check");
    expect(sql).toContain("gift_card_programme_rates_public_shape_check");
    expect(sql).toContain('drop policy if exists "public read current gift_card_programmes"');
    expect(sql).toContain('drop policy if exists "public read current gift_card_programme_rates"');
    expect(sql.match(/Australia\/Sydney/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(sql).toContain("drop policy if exists \"public read sealed gift card occurrences\"");
    expect(sql).toContain("idx_gc_occurrence_business_identity");
    expect(sql).toContain("coalesce(start_date, '-infinity'::date)");
    expect(sql).toContain("Duplicate gift-card occurrence identities must be reviewed");
    expect(sql).toContain("do not delete immutable occurrence evidence automatically");
  });

  it("uses Sydney dates for reviewed acceptance removals", () => {
    const sql = migration("028_gift_card_acceptance_extensions.sql");
    expect(sql).not.toMatch(/p_valid_until date default current_date/i);
    expect(sql).not.toMatch(/coalesce\(p_valid_until, current_date\)/i);
    expect(sql).toContain("pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'");
  });

  it("reconciles the fixed_points drift as an additive, idempotent forward migration", () => {
    const sql = migration("031_gift_card_fixed_points_reconciliation.sql");
    // Adds the column to all three production-drifted tables, idempotently.
    expect(sql).toContain(
      "alter table public.gift_card_offer_candidates\n  add column if not exists fixed_points numeric;"
    );
    expect(sql).toContain(
      "alter table public.gift_card_offers\n  add column if not exists fixed_points numeric;"
    );
    expect(sql).toContain(
      "alter table public.gift_card_offer_occurrences\n  add column if not exists fixed_points numeric;"
    );
    expect(sql).toContain("gift_card_offer_occurrences_mechanic_check");
    expect(sql).toContain("pg_catalog.pg_get_constraintdef");
    // No invented data / backfill of point values: the only write of
    // fixed_points is the reviewed approve RPC upsert (excluded.fixed_points),
    // never a bulk UPDATE … SET fixed_points = <value> over existing rows.
    expect(sql).not.toMatch(/update\s+public\.gift_card_offers\s+set\s+fixed_points\s*=/i);
    expect(sql).not.toMatch(/update\s+public\.gift_card_offer_candidates\s+set\s+fixed_points\s*=/i);
    // fixed_points cannot be negative (value-check rule on both tables).
    expect(
      sql.match(/\(fixed_points is null or fixed_points > 0\)/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(2);
    // Value-check constraints are dropped-if-exists before re-add → retry-safe.
    expect(sql).toContain(
      "drop constraint if exists gift_card_candidates_accuracy_values_check"
    );
    expect(sql).toContain(
      "drop constraint if exists gift_card_offers_accuracy_values_check"
    );
    // The public accuracy check stays NOT VALID (legacy rows not retro-validated)
    // and its points branch now accepts a fixed-points-only offer.
    expect(sql).toContain("drop constraint if exists gift_card_offers_public_accuracy_check");
    expect(sql).toMatch(/gift_card_offers_public_accuracy_check[\s\S]*not valid/i);
    expect(sql).toContain(
      "(coalesce(points_multiplier, 0) > 0 or coalesce(fixed_points, 0) > 0)"
    );
    // RPC is refreshed with fixed_points, transactional + hardened.
    expect(sql).toContain("create or replace function public.approve_gift_card_candidate");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("for update");
    expect(sql).toContain("insert into public.audit_log");
    expect(sql).toContain("fixed_points = excluded.fixed_points");
    expect(sql).toContain(
      "Points require exactly one of multiplier or fixed points, plus a programme"
    );
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
    // The sync trigger fingerprints fixed_points so change detection sees it.
    expect(sql).toContain("create or replace function public.sync_gift_card_candidate_accuracy");
    expect(sql).toContain(
      "new.fixed_points := coalesce((new.terms_json->>'fixedPoints')::numeric, new.fixed_points);"
    );
    expect(sql).toContain("'fixedPoints', new.fixed_points,");
    // It must NOT rewrite 023 as the repair mechanism.
    expect(sql).not.toMatch(/re-?run 023/i);
  });

  it("guards against the fixed_points drift recurring silently in the manifest", () => {
    // The manifest must attribute fixed_points to the production-lineage
    // migration (031), and 031 must be covered. If someone reverts either, this
    // fails — the drift can no longer slip back in unnoticed.
    expect(COVERED_MIGRATIONS).toContain(
      "031_gift_card_fixed_points_reconciliation.sql"
    );
    expect(EXPECTED_SCHEMA.gift_card_offers.columns.fixed_points).toBe(
      "031_gift_card_fixed_points_reconciliation.sql"
    );
    expect(EXPECTED_SCHEMA.gift_card_offer_candidates.columns.fixed_points).toBe(
      "031_gift_card_fixed_points_reconciliation.sql"
    );
    expect(EXPECTED_SCHEMA.gift_card_offer_occurrences.columns.fixed_points).toBe(
      "031_gift_card_fixed_points_reconciliation.sql"
    );
  });

});
