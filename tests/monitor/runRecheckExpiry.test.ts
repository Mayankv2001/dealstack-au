import { describe, expect, it, vi } from "vitest";
import {
  runRecheckExpiry,
  type RecheckCandidate,
  type RunRecheckConfig,
  type RunRecheckDeps,
} from "@/lib/monitor/runRecheckExpiry";
import type { SourceStatus } from "@/lib/monitor/validateSourcePost";

const NOW = new Date("2026-07-11T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const POST = "https://www.ozbargain.com.au/node/";

const LIVE: RunRecheckConfig = { batchSize: 30, dryRun: false };
const PREVIEW: RunRecheckConfig = { batchSize: 30, dryRun: true };

function candidate(
  id: string,
  over: Partial<RecheckCandidate> = {}
): RecheckCandidate {
  return {
    id,
    link: `${POST}${id.replace(/\D/g, "") || "1"}`,
    sourceNativeId: `ozb:${id}`,
    consecutiveFailures: 0,
    failureStreakStartedAt: null,
    sourceMarkedExpired: false,
    declaredExpiresAt: null,
    ...over,
  };
}

function classifyAs(status: SourceStatus) {
  return { status, httpStatus: status === "deleted" ? 404 : 200, reason: null };
}

function makeDeps(over: Partial<RunRecheckDeps> = {}): RunRecheckDeps {
  return {
    now: () => NOW,
    startRun: vi.fn(async () => ({ started: true, runId: "run-1" })),
    finishRun: vi.fn(async () => {}),
    listCandidates: vi.fn(async () => []),
    classify: vi.fn(async () => classifyAs("active")),
    archive: vi.fn(async () => true),
    stamp: vi.fn(async () => {}),
    ...over,
  };
}

describe("runRecheckExpiry — live mode", () => {
  it("keeps an active source in review: stamps a reset, never archives", async () => {
    const stamp = vi.fn(async () => {});
    const archive = vi.fn(async () => true);
    const deps = makeDeps({
      listCandidates: vi.fn(async () => [candidate("n1")]),
      classify: vi.fn(async () => classifyAs("active")),
      stamp,
      archive,
    });
    const out = await runRecheckExpiry(LIVE, deps);
    expect(archive).not.toHaveBeenCalled();
    expect(stamp).toHaveBeenCalledWith(
      "n1",
      expect.objectContaining({ sourceStatus: "active", lastValidatedAt: NOW })
    );
    if (out.started) expect(out.metrics.active).toBe(1);
  });

  it("archives a deleted source with source_deleted and the run id", async () => {
    const archive = vi.fn(async () => true);
    const deps = makeDeps({
      listCandidates: vi.fn(async () => [candidate("n5")]),
      classify: vi.fn(async () => classifyAs("deleted")),
      archive,
    });
    const out = await runRecheckExpiry(LIVE, deps);
    expect(archive).toHaveBeenCalledWith(
      "n5",
      expect.objectContaining({
        archiveReason: "source_deleted",
        sourceStatus: "deleted",
        sourceIdentifier: `${POST}5`,
        runId: "run-1",
        checkedAt: NOW,
      })
    );
    if (out.started) {
      expect(out.metrics.deleted).toBe(1);
      expect(out.metrics.wouldArchive).toBe(1);
      expect(out.metrics.actuallyArchived).toBe(1);
    }
  });

  it("archives an explicitly expired source with source_expired", async () => {
    const archive = vi.fn(async () => true);
    const deps = makeDeps({
      listCandidates: vi.fn(async () => [candidate("n7")]),
      classify: vi.fn(async () => classifyAs("expired")),
      archive,
    });
    const out = await runRecheckExpiry(LIVE, deps);
    expect(archive).toHaveBeenCalledWith(
      "n7",
      expect.objectContaining({ archiveReason: "source_expired" })
    );
    if (out.started) expect(out.metrics.actuallyArchived).toBe(1);
  });

  it("never archives a fetch_failed item — records the streak instead", async () => {
    const archive = vi.fn(async () => true);
    const stamp = vi.fn(async () => {});
    const deps = makeDeps({
      listCandidates: vi.fn(async () => [candidate("n2")]),
      classify: vi.fn(async () => classifyAs("fetch_failed")),
      archive,
      stamp,
    });
    const out = await runRecheckExpiry(LIVE, deps);
    expect(archive).not.toHaveBeenCalled();
    expect(stamp).toHaveBeenCalledWith(
      "n2",
      expect.objectContaining({ consecutiveFailures: 1, failureStreakStartedAt: NOW })
    );
    if (out.started) {
      expect(out.metrics.fetchFailed).toBe(1);
      expect(out.metrics.wouldArchive).toBe(0);
      expect(out.metrics.actuallyArchived).toBe(0);
    }
  });

  it("never archives repeated unknown/failed items regardless of streak age", async () => {
    const archive = vi.fn(async () => true);
    const deps = makeDeps({
      listCandidates: vi.fn(async () => [
        candidate("n9", {
          consecutiveFailures: 50,
          failureStreakStartedAt: new Date(NOW.getTime() - 500 * HOUR),
        }),
      ]),
      classify: vi.fn(async () => classifyAs("unknown")),
      archive,
    });
    const out = await runRecheckExpiry(LIVE, deps);
    expect(archive).not.toHaveBeenCalled();
    if (out.started) expect(out.metrics.actuallyArchived).toBe(0);
  });

  it("skips the whole run when another run holds the lock", async () => {
    const classify = vi.fn(async () => classifyAs("deleted"));
    const finishRun = vi.fn(async () => {});
    const deps = makeDeps({
      startRun: vi.fn(async () => ({ started: false, reason: "already-running" as const })),
      classify,
      finishRun,
      listCandidates: vi.fn(async () => [candidate("n1")]),
    });
    const out = await runRecheckExpiry(LIVE, deps);
    expect(out).toEqual({ started: false, reason: "already-running" });
    expect(classify).not.toHaveBeenCalled();
    expect(finishRun).not.toHaveBeenCalled();
  });

  it("requests a bounded batch (never unbounded)", async () => {
    const listCandidates = vi.fn(async () => []);
    await runRecheckExpiry(LIVE, makeDeps({ listCandidates }));
    expect(listCandidates).toHaveBeenCalledWith(NOW, 30);
  });

  it("skips (never probes) an item whose stored link is not an approved post", async () => {
    const classify = vi.fn(async () => classifyAs("active"));
    const deps = makeDeps({
      listCandidates: vi.fn(async () => [
        { ...candidate("bad"), link: "https://example.com/not-a-post" },
      ]),
      classify,
    });
    const out = await runRecheckExpiry(LIVE, deps);
    expect(classify).not.toHaveBeenCalled();
    if (out.started) expect(out.metrics.skipped).toBe(1);
  });

  it("archives ONLY explicit expired/deleted items in a mixed batch", async () => {
    const statuses: SourceStatus[] = [
      "active",
      "deleted",
      "fetch_failed",
      "expired",
      "unknown",
    ];
    const candidates = statuses.map((_, i) => candidate(`n${i + 1}`));
    let call = 0;
    const archive = vi.fn(async () => true);
    const deps = makeDeps({
      listCandidates: vi.fn(async () => candidates),
      classify: vi.fn(async () => classifyAs(statuses[call++])),
      archive,
    });
    const out = await runRecheckExpiry(LIVE, deps);
    expect(archive).toHaveBeenCalledTimes(2); // deleted + expired only
    if (out.started) {
      expect(out.metrics.scanned).toBe(5);
      expect(out.metrics.active).toBe(1);
      expect(out.metrics.deleted).toBe(1);
      expect(out.metrics.expired).toBe(1);
      expect(out.metrics.fetchFailed).toBe(1);
      expect(out.metrics.unknown).toBe(1);
      expect(out.metrics.wouldArchive).toBe(2);
      expect(out.metrics.actuallyArchived).toBe(2);
      expect(out.metrics.dryRun).toBe(false);
    }
  });
});

describe("runRecheckExpiry — stored feed facts (expiry without probing)", () => {
  it("archives a feed-marker-expired item WITHOUT any probe", async () => {
    const classify = vi.fn(async () => classifyAs("active"));
    const archive = vi.fn(async () => true);
    const deps = makeDeps({
      listCandidates: vi.fn(async () => [
        candidate("n11", { sourceMarkedExpired: true }),
      ]),
      classify,
      archive,
    });
    const out = await runRecheckExpiry(LIVE, deps);
    expect(classify).not.toHaveBeenCalled();
    expect(archive).toHaveBeenCalledWith(
      "n11",
      expect.objectContaining({
        archiveReason: "source_expired",
        sourceStatus: "expired",
        signal: "feed-expired-marker",
        runId: "run-1",
      })
    );
    if (out.started) {
      expect(out.metrics.expired).toBe(1);
      expect(out.metrics.actuallyArchived).toBe(1);
    }
  });

  it("archives on a passed declared expiry, probes when still within the margin", async () => {
    const withinMargin = new Date(NOW.getTime() - 2 * HOUR);
    const pastMargin = new Date(NOW.getTime() - 30 * HOUR);
    const classify = vi.fn(async () => classifyAs("active"));
    const archive = vi.fn(async () => true);
    const deps = makeDeps({
      listCandidates: vi.fn(async () => [
        candidate("n12", { declaredExpiresAt: withinMargin }),
        candidate("n13", { declaredExpiresAt: pastMargin }),
      ]),
      classify,
      archive,
    });
    await runRecheckExpiry(LIVE, deps);
    // Only the within-margin item is probed; the past-margin one archives
    // from stored facts alone.
    expect(classify).toHaveBeenCalledTimes(1);
    expect(archive).toHaveBeenCalledTimes(1);
    expect(archive).toHaveBeenCalledWith(
      "n13",
      expect.objectContaining({ signal: "feed-declared-expiry-passed" })
    );
  });

  it("counts stored-expired items in preview without any write or probe", async () => {
    const classify = vi.fn(async () => classifyAs("active"));
    const archive = vi.fn(async () => true);
    const stamp = vi.fn(async () => {});
    const deps = makeDeps({
      listCandidates: vi.fn(async () => [
        candidate("n14", { sourceMarkedExpired: true }),
      ]),
      classify,
      archive,
      stamp,
    });
    const out = await runRecheckExpiry(PREVIEW, deps);
    expect(classify).not.toHaveBeenCalled();
    expect(archive).not.toHaveBeenCalled();
    expect(stamp).not.toHaveBeenCalled();
    if (out.started) {
      expect(out.metrics.expired).toBe(1);
      expect(out.metrics.wouldArchive).toBe(1);
      expect(out.metrics.actuallyArchived).toBe(0);
    }
  });
});

describe("runRecheckExpiry — dry-run preview", () => {
  it("classifies and counts wouldArchive but writes NOTHING", async () => {
    const archive = vi.fn(async () => true);
    const stamp = vi.fn(async () => {});
    const statuses: SourceStatus[] = ["deleted", "expired", "active", "fetch_failed"];
    let call = 0;
    const deps = makeDeps({
      listCandidates: vi.fn(async () =>
        statuses.map((_, i) => candidate(`n${i + 1}`))
      ),
      classify: vi.fn(async () => classifyAs(statuses[call++])),
      archive,
      stamp,
    });
    const out = await runRecheckExpiry(PREVIEW, deps);

    // No writes of any kind in preview.
    expect(archive).not.toHaveBeenCalled();
    expect(stamp).not.toHaveBeenCalled();
    if (out.started) {
      expect(out.metrics.dryRun).toBe(true);
      expect(out.metrics.wouldArchive).toBe(2); // deleted + expired
      expect(out.metrics.actuallyArchived).toBe(0); // never in preview
      expect(out.metrics.scanned).toBe(4);
    }
  });
});
