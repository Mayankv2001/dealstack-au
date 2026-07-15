import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: mocks.admin }));

import {
  applyGiftCardLifecycle,
  GiftCardLifecycleSchemaUnavailableError,
  LIFECYCLE_STALE_RUN_MINUTES,
  lastSuccessfulLifecycleRunStart,
  startLifecycleRun,
} from "@/lib/admin/repos/giftCardLifecycle";

beforeEach(() => vi.clearAllMocks());

describe("gift-card lifecycle persistence boundary", () => {
  it("takes over only runs older than maxDuration plus grace before acquiring", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "run-1", error: null });
    mocks.admin.mockReturnValue({ rpc });
    const now = new Date("2026-07-15T00:00:00Z");

    await expect(startLifecycleRun(now)).resolves.toEqual({
      started: true,
      runId: "run-1",
    });
    expect(rpc).toHaveBeenCalledWith("acquire_gift_card_job_run", {
      p_source_id: "gcdb",
      p_run_kind: "activate-archive",
      p_started_at: "2026-07-15T00:00:00.000Z",
      p_lease_expires_at: new Date(
        now.getTime() + LIFECYCLE_STALE_RUN_MINUTES * 60_000,
      ).toISOString(),
    });
  });

  it("returns lock contention for a duplicate slot or mutation-fence clash", async () => {
    mocks.admin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    await expect(startLifecycleRun(new Date())).resolves.toEqual({
      started: false,
      reason: "already-running",
    });
  });

  it("counts only fully successful runs for same-local-day dedup", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { started_at: "2026-07-14T21:07:00Z", status: "ok" },
      error: null,
    });
    const query = {
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    mocks.admin.mockReturnValue({
      from: () => ({ select: () => query }),
    });
    await expect(lastSuccessfulLifecycleRunStart()).resolves.toEqual(
      new Date("2026-07-14T21:07:00Z"),
    );
    expect(query.eq).toHaveBeenCalledWith("run_kind", "activate-archive");
    expect(query.eq).toHaveBeenCalledWith("source_id", "gcdb");
    expect(query.eq).toHaveBeenCalledWith("status", "ok");
  });

  it("maps the RPC result and fails closed when migration 032 is absent", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          sydneyDate: "2026-07-15",
          activatedOfferIds: ["a"],
          archivedOfferIds: ["b"],
          historySealedOfferIds: ["b"],
          affectedStoreIds: ["jb-hifi"],
          errors: [],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST202", message: "function not in schema cache" },
      });
    mocks.admin.mockReturnValue({ rpc });
    await expect(applyGiftCardLifecycle(new Date("2026-07-14T21:07:00Z"))).resolves
      .toMatchObject({ activatedOfferIds: ["a"], archivedOfferIds: ["b"] });
    await expect(applyGiftCardLifecycle(new Date())).rejects.toBeInstanceOf(
      GiftCardLifecycleSchemaUnavailableError,
    );
  });
});
