import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Expiry-recheck repo tests — the scope boundary (only pending OzBargain post
 * URLs), the archival RPC contract, the streak-stamp write guard, and the
 * one-running lock. A tiny chainable Supabase stub records calls and returns a
 * queued result per await; no real DB.
 */

const { dbState } = vi.hoisted(() => {
  const state: {
    calls: Array<[string, unknown[]]>;
    results: Array<{ data?: unknown; error?: unknown }>;
    idx: number;
    rpc: ReturnType<typeof vi.fn>;
  } = { calls: [], results: [], idx: 0, rpc: vi.fn() };
  return { dbState: state };
});

vi.mock("@/lib/supabase/admin", () => {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          const res = dbState.results[dbState.idx] ?? { data: null, error: null };
          dbState.idx++;
          return (resolve: (v: unknown) => void) => resolve(res);
        }
        return (...args: unknown[]) => {
          dbState.calls.push([String(prop), args]);
          return proxy;
        };
      },
    }
  );
  return {
    getSupabaseAdmin: () => ({
      from: (t: string) => {
        dbState.calls.push(["from", [t]]);
        return proxy;
      },
      rpc: dbState.rpc,
    }),
  };
});

import {
  archiveRecheckItem,
  listRecheckCandidates,
  startRecheckRun,
  stampRecheckItem,
} from "@/lib/admin/repos/recheckExpiry";

function findCall(name: string): unknown[] | undefined {
  return dbState.calls.find(([n]) => n === name)?.[1];
}

beforeEach(() => {
  dbState.calls = [];
  dbState.results = [];
  dbState.idx = 0;
  dbState.rpc = vi.fn();
});

const NOW = new Date("2026-07-11T00:00:00.000Z");

describe("listRecheckCandidates — scope and ordering", () => {
  it("filters pending OzBargain posts, oldest-checked first, and drops bad links", async () => {
    dbState.results = [
      {
        data: [
          {
            id: "a",
            link: "https://www.ozbargain.com.au/node/111",
            source_native_id: "ozb:a",
            consecutive_validation_failures: 2,
            failure_streak_started_at: "2026-07-10T00:00:00.000Z",
            source_marked_expired: true,
            declared_expires_at: "2026-07-01T00:00:00.000Z",
          },
          {
            id: "b",
            link: "https://example.com/not-a-post",
            source_native_id: "ozb:b",
            consecutive_validation_failures: 0,
            failure_streak_started_at: null,
            source_marked_expired: null,
            declared_expires_at: null,
          },
        ],
        error: null,
      },
    ];

    const out = await listRecheckCandidates(NOW, 30, 20);

    expect(findCall("eq")).toEqual(["review_state", "new"]);
    expect(findCall("like")).toEqual(["link", "%ozbargain.com.au/node/%"]);
    expect(findCall("order")).toEqual([
      "last_source_check_at",
      { ascending: true, nullsFirst: true },
    ]);
    expect(findCall("limit")).toEqual([30]);

    // The non-OzBargain link is filtered out; the valid one is mapped.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "a",
      consecutiveFailures: 2,
      sourceMarkedExpired: true,
    });
    expect(out[0].failureStreakStartedAt).toEqual(
      new Date("2026-07-10T00:00:00.000Z")
    );
    expect(out[0].declaredExpiresAt).toEqual(
      new Date("2026-07-01T00:00:00.000Z")
    );
  });
});

describe("archiveRecheckItem — RPC contract", () => {
  it("calls the transactional RPC with the safe identifier and run id", async () => {
    dbState.rpc.mockResolvedValue({ data: true, error: null });
    const archived = await archiveRecheckItem("item-1", {
      archiveReason: "source_deleted",
      sourceStatus: "deleted",
      sourceIdentifier: "https://www.ozbargain.com.au/node/111",
      signal: "source-http-404",
      runId: "run-1",
      checkedAt: NOW,
    });
    expect(archived).toBe(true);
    expect(dbState.rpc).toHaveBeenCalledWith("archive_recheck_feed_item", {
      p_feed_item_id: "item-1",
      p_archive_reason: "source_deleted",
      p_source_status: "deleted",
      p_source_identifier: "https://www.ozbargain.com.au/node/111",
      p_run_id: "run-1",
      p_checked_at: NOW.toISOString(),
      p_signal: "source-http-404",
    });
  });

  it("returns false when the RPC reports no row archived (race)", async () => {
    dbState.rpc.mockResolvedValue({ data: false, error: null });
    const archived = await archiveRecheckItem("item-1", {
      archiveReason: "source_deleted",
      sourceStatus: "deleted",
      sourceIdentifier: "x",
      signal: null,
      runId: "run-1",
      checkedAt: NOW,
    });
    expect(archived).toBe(false);
  });
});

describe("stampRecheckItem — write guard", () => {
  it("only updates rows still awaiting review", async () => {
    dbState.results = [{ error: null }];
    await stampRecheckItem("item-1", {
      sourceStatus: "fetch_failed",
      lastSourceCheckAt: NOW,
      lastValidatedAt: null,
      consecutiveFailures: 1,
      failureStreakStartedAt: NOW,
      lastValidationError: "source-http-503",
    });
    const eqCalls = dbState.calls.filter(([n]) => n === "eq").map(([, a]) => a);
    expect(eqCalls).toContainEqual(["review_state", "new"]);
    expect(eqCalls).toContainEqual(["id", "item-1"]);
  });
});

describe("startRecheckRun — one-running lock", () => {
  it("returns already-running on a unique_violation", async () => {
    dbState.results = [
      { error: null }, // stale takeover update
      { data: null, error: { code: "23505" } }, // insert conflicts with the lock
    ];
    const out = await startRecheckRun(NOW);
    expect(out).toEqual({ started: false, reason: "already-running" });
  });

  it("claims the slot and returns the run id when free", async () => {
    dbState.results = [
      { error: null },
      { data: { id: "run-9" }, error: null },
    ];
    const out = await startRecheckRun(NOW);
    expect(out).toEqual({ started: true, runId: "run-9" });
  });
});
