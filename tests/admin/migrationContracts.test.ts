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
});
