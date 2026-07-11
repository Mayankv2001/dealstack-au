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
});
