import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: mocks.admin }));

import {
  lastIngestRunStart,
  startIngestRun,
} from "@/lib/admin/repos/giftCardPipeline";
import {
  lastReconcileRunStart,
  RECONCILE_RUN_SOURCE_ID,
  startReconcileRun,
} from "@/lib/admin/repos/giftCardReconcileRuns";
import { GiftCardJobRunSchemaUnavailableError } from "@/lib/admin/repos/giftCardJobRunErrors";

beforeEach(() => vi.clearAllMocks());

function intervalTable(startedAt = "2026-07-15T00:00:00Z") {
  const query = {
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { started_at: startedAt, status: "ok" },
      error: null,
    }),
  };
  return { query, table: { select: vi.fn().mockReturnValue(query) } };
}

describe("gift-card job-run source/kind scoping", () => {
  it("ingest can take over only a stale ingest for the same source", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "ingest-1", error: null });
    mocks.admin.mockReturnValue({ rpc });

    await expect(
      startIngestRun("point_hacks_weekly", new Date("2026-07-15T00:00:00Z")),
    ).resolves.toEqual({ started: true, runId: "ingest-1" });

    expect(rpc).toHaveBeenCalledWith("acquire_gift_card_job_run", {
      p_source_id: "point_hacks_weekly",
      p_run_kind: "ingest",
      p_started_at: "2026-07-15T00:00:00.000Z",
      p_lease_expires_at: "2026-07-15T00:15:00.000Z",
    });
  });

  it("ingest interval lookup cannot count another run kind", async () => {
    const { table, query } = intervalTable();
    mocks.admin.mockReturnValue({ from: () => table });

    await expect(lastIngestRunStart("gcdb")).resolves.toEqual(
      new Date("2026-07-15T00:00:00Z"),
    );
    expect(query.eq).toHaveBeenCalledWith("source_id", "gcdb");
    expect(query.eq).toHaveBeenCalledWith("run_kind", "ingest");
  });

  it("reconcile can take over only its anchored source and run kind", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "reconcile-1", error: null });
    mocks.admin.mockReturnValue({ rpc });

    await expect(
      startReconcileRun(new Date("2026-07-15T00:00:00Z")),
    ).resolves.toEqual({ started: true, runId: "reconcile-1" });

    expect(rpc).toHaveBeenCalledWith("acquire_gift_card_job_run", {
      p_source_id: RECONCILE_RUN_SOURCE_ID,
      p_run_kind: "reconcile",
      p_started_at: "2026-07-15T00:00:00.000Z",
      p_lease_expires_at: "2026-07-15T00:30:00.000Z",
    });
  });

  it("reconcile interval lookup is source and kind scoped", async () => {
    const { table, query } = intervalTable();
    mocks.admin.mockReturnValue({ from: () => table });

    await expect(lastReconcileRunStart()).resolves.toEqual(
      new Date("2026-07-15T00:00:00Z"),
    );
    expect(query.eq).toHaveBeenCalledWith(
      "source_id",
      RECONCILE_RUN_SOURCE_ID,
    );
    expect(query.eq).toHaveBeenCalledWith("run_kind", "reconcile");
  });

  it("fails before insert when migration 030's run_kind is unavailable", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not in schema cache" },
    });
    mocks.admin.mockReturnValue({
      rpc,
    });

    await expect(
      startIngestRun("gcdb", new Date("2026-07-15T00:00:00Z")),
    ).rejects.toBeInstanceOf(GiftCardJobRunSchemaUnavailableError);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("returns contention when the database keeps a live same-kind or mutation-fence lease", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    mocks.admin.mockReturnValue({ rpc });

    await expect(
      startReconcileRun(new Date("2026-07-15T00:00:00Z")),
    ).resolves.toEqual({ started: false, reason: "already-running" });
  });
});
