import { describe, expect, it } from "vitest";
import {
  runGuardedIngest,
  type GuardedIngestDeps,
} from "@/lib/giftcards/runGuarded";
import type { IngestMetrics } from "@/lib/giftcards/runIngest";

/**
 * The guarded orchestration is the cron's safety envelope. These prove that
 * once the one-running lock is claimed, no failure can leave the run stuck in
 * `running`, and that observability failures never block or mask finalisation.
 */

function okMetrics(): IngestMetrics {
  return {
    status: "ok",
    fetchStatus: "ok",
    itemsSeen: 1,
    itemsNew: 1,
    itemsUpdated: 0,
    itemsUnchanged: 0,
    itemsRejected: 0,
    candidatesNew: 1,
    candidatesChanged: 0,
    snapshotHash: "hash",
    errors: [],
  };
}

/** A stateful fake that models the DB one-running lock. */
function lockFake(overrides: Partial<GuardedIngestDeps> = {}) {
  let running = false;
  const calls = {
    acquire: 0,
    run: 0,
    finish: [] as Array<{ runId: string; metrics: IngestMetrics }>,
    fail: [] as Array<{ runId: string; message: string }>,
    report: [] as string[],
  };
  const deps: GuardedIngestDeps = {
    acquire: async () => {
      calls.acquire++;
      if (running) return { started: false, reason: "already-running" };
      running = true;
      return { started: true, runId: "run-1" };
    },
    run: async () => {
      calls.run++;
      return okMetrics();
    },
    finish: async (runId, metrics) => {
      calls.finish.push({ runId, metrics });
      running = false; // finalisation releases the lock
    },
    fail: async (runId, message) => {
      calls.fail.push({ runId, message });
      running = false; // finalisation releases the lock
    },
    report: async (message) => {
      calls.report.push(message);
    },
    ...overrides,
  };
  return { deps, calls, isRunning: () => running };
}

describe("runGuardedIngest — happy path", () => {
  it("acquires the lock, runs, and finalises with metrics", async () => {
    const { deps, calls, isRunning } = lockFake();
    const outcome = await runGuardedIngest(deps);

    expect(calls.acquire).toBe(1);
    expect(calls.run).toBe(1);
    expect(calls.finish).toHaveLength(1);
    expect(calls.fail).toHaveLength(0);
    expect(isRunning()).toBe(false); // lock released
    expect(outcome).toEqual({ ran: true, metrics: okMetrics() });
  });

  it("returns a skip without running when the lock is already held", async () => {
    const { deps } = lockFake({
      acquire: async () => ({ started: false, reason: "already-running" }),
    });
    const outcome = await runGuardedIngest(deps);
    expect(outcome).toEqual({ ran: false, skipped: "already-running" });
  });
});

describe("runGuardedIngest — a thrown ingest finalises as error", () => {
  it("calls fail (not finish) and never leaves the run running", async () => {
    const { deps, calls, isRunning } = lockFake({
      run: async () => {
        throw new Error("loadRawItems exploded");
      },
    });
    const outcome = await runGuardedIngest(deps);

    expect(calls.finish).toHaveLength(0);
    expect(calls.fail).toHaveLength(1);
    expect(calls.fail[0]).toEqual({
      runId: "run-1",
      message: "loadRawItems exploded",
    });
    expect(isRunning()).toBe(false); // NOT stuck as running
    expect(outcome).toEqual({ ran: true, failed: true });
  });

  it("finalises as error even when finish() itself throws", async () => {
    const { deps, calls } = lockFake({
      finish: async () => {
        throw new Error("finish write failed");
      },
    });
    const outcome = await runGuardedIngest(deps);
    expect(calls.fail).toHaveLength(1);
    expect(outcome).toEqual({ ran: true, failed: true });
  });
});

describe("runGuardedIngest — the lock is not permanently blocked", () => {
  it("lets a later run acquire the lock after a failed run releases it", async () => {
    let shouldThrow = true;
    const { deps, calls, isRunning } = lockFake({
      run: async () => {
        calls.run++;
        if (shouldThrow) throw new Error("transient failure");
        return okMetrics();
      },
    });

    const first = await runGuardedIngest(deps);
    expect(first).toEqual({ ran: true, failed: true });
    expect(isRunning()).toBe(false);

    shouldThrow = false;
    const second = await runGuardedIngest(deps);
    expect(second).toEqual({ ran: true, metrics: okMetrics() });
    expect(calls.acquire).toBe(2); // the second call really re-acquired
  });
});

describe("runGuardedIngest — observability failures are non-fatal", () => {
  it("still finalises as error when report() throws after a thrown ingest", async () => {
    const { deps, calls, isRunning } = lockFake({
      run: async () => {
        throw new Error("boom");
      },
      report: async () => {
        throw new Error("sentry is down");
      },
    });

    // Must not reject — the orchestration swallows the report failure.
    const outcome = await runGuardedIngest(deps);
    expect(calls.fail).toHaveLength(1); // finalisation happened
    expect(isRunning()).toBe(false);
    expect(outcome).toEqual({ ran: true, failed: true });
  });

  it("does not crash the happy path when a partial-run report throws", async () => {
    const partial: IngestMetrics = { ...okMetrics(), status: "partial", errors: ["one item rejected"] };
    const { deps, calls } = lockFake({
      run: async () => partial,
      report: async () => {
        throw new Error("sentry is down");
      },
    });
    const outcome = await runGuardedIngest(deps);
    expect(calls.finish).toHaveLength(1); // finalised normally
    expect(outcome).toEqual({ ran: true, metrics: partial });
  });
});
