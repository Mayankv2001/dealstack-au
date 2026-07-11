import { describe, expect, it, vi } from "vitest";
import { classifySourcePost } from "@/lib/monitor/validateSourcePost";
import {
  classifyStoredSourceState,
  DECLARED_EXPIRY_ARCHIVE_MARGIN_HOURS,
  decideRecheckOutcome,
} from "@/lib/monitor/recheckExpiry";

/**
 * Source classifier + pure decision logic.
 *
 * NOTE ON EXPIRY: repository policy is RSS/Atom + HEAD only — scraping any HTML
 * page is forbidden (CLAUDE.md; docs/ozbargain-monitoring.md "not allowed"). So
 * the probe is status-only and there is NO HTML fixture to parse; the
 * transport-level signals are covered here via HTTP status and `expired` is
 * never produced by the probe. Expiry instead comes from STORED structured
 * feed facts — OzBargain's own `<ozb:title-msg type="expired">` marker and
 * `<ozb:meta expiry>` timestamp captured at ingest — classified offline by
 * classifyStoredSourceState (tested below, zero network).
 */

const POST = "https://www.ozbargain.com.au/node/123456";
const UA = "DealStackAU/1.0";
const HOUR = 60 * 60 * 1000;

function respond(status: number, headers: Record<string, string> = {}) {
  return vi.fn(async () => new Response(null, { status, headers }));
}

describe("classifySourcePost — HEAD-only transport signals", () => {
  it("maps 2xx to active", async () => {
    expect((await classifySourcePost(POST, UA, respond(200))).status).toBe("active");
  });

  it.each([404, 410])("maps permanent HTTP %s to deleted", async (status) => {
    const c = await classifySourcePost(POST, UA, respond(status));
    expect(c.status).toBe("deleted");
    expect(c.httpStatus).toBe(status);
  });

  it("maps 403 (anti-bot / forbidden) to unknown — never archives", async () => {
    expect((await classifySourcePost(POST, UA, respond(403))).status).toBe("unknown");
  });

  it("maps 429 (rate limited) to fetch_failed, never deleted/expired", async () => {
    expect((await classifySourcePost(POST, UA, respond(429))).status).toBe(
      "fetch_failed"
    );
  });

  it.each([500, 502, 503, 504])(
    "maps 5xx (%s) to fetch_failed",
    async (status) => {
      expect((await classifySourcePost(POST, UA, respond(status))).status).toBe(
        "fetch_failed"
      );
    }
  );

  it("maps a network/timeout throw to fetch_failed", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("The operation was aborted");
    });
    expect((await classifySourcePost(POST, UA, fetcher)).status).toBe("fetch_failed");
  });

  it("maps a redirect off the approved post boundary to unknown, not deleted", async () => {
    const fetcher = respond(301, {
      location: "https://www.ozbargain.com.au/deals/somewhere",
    });
    expect((await classifySourcePost(POST, UA, fetcher)).status).toBe("unknown");
  });

  it("does not fetch an unsupported (non-OzBargain) URL", async () => {
    const fetcher = vi.fn();
    const c = await classifySourcePost("https://example.com/x", UA, fetcher);
    expect(c.status).toBe("unknown");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("classifyStoredSourceState — stored feed facts, no probe", () => {
  const now = new Date("2026-07-11T00:00:00.000Z");
  const MARGIN_MS = DECLARED_EXPIRY_ARCHIVE_MARGIN_HOURS * HOUR;

  it("returns the explicit feed expired-marker signal immediately", () => {
    expect(
      classifyStoredSourceState(
        { sourceMarkedExpired: true, declaredExpiresAt: null },
        now
      )
    ).toBe("feed-expired-marker");
  });

  it("prefers the explicit marker over any declared timestamp", () => {
    expect(
      classifyStoredSourceState(
        {
          sourceMarkedExpired: true,
          declaredExpiresAt: new Date(now.getTime() + 100 * HOUR),
        },
        now
      )
    ).toBe("feed-expired-marker");
  });

  it("trusts a declared expiry only once the safety margin has passed", () => {
    const justPassed = new Date(now.getTime() - MARGIN_MS + HOUR); // 23h ago
    const wellPassed = new Date(now.getTime() - MARGIN_MS - HOUR); // 25h ago
    expect(
      classifyStoredSourceState(
        { sourceMarkedExpired: false, declaredExpiresAt: justPassed },
        now
      )
    ).toBeNull();
    expect(
      classifyStoredSourceState(
        { sourceMarkedExpired: false, declaredExpiresAt: wellPassed },
        now
      )
    ).toBe("feed-declared-expiry-passed");
  });

  it("returns null for a future declared expiry", () => {
    expect(
      classifyStoredSourceState(
        {
          sourceMarkedExpired: false,
          declaredExpiresAt: new Date(now.getTime() + HOUR),
        },
        now
      )
    ).toBeNull();
  });

  it("returns null when no source facts are stored (falls through to the probe)", () => {
    expect(
      classifyStoredSourceState(
        { sourceMarkedExpired: false, declaredExpiresAt: null },
        now
      )
    ).toBeNull();
  });
});

describe("decideRecheckOutcome — archive only on explicit expired/deleted", () => {
  const now = new Date("2026-07-11T00:00:00.000Z");

  it("keeps an active source in review by resetting the streak", () => {
    const d = decideRecheckOutcome(
      { consecutiveFailures: 2, failureStreakStartedAt: new Date(now.getTime() - 5 * HOUR) },
      "active",
      now
    );
    expect(d).toEqual({ action: "reset", sourceStatus: "active" });
  });

  it("archives an explicitly deleted source with source_deleted", () => {
    const d = decideRecheckOutcome(
      { consecutiveFailures: 0, failureStreakStartedAt: null },
      "deleted",
      now
    );
    expect(d).toMatchObject({ action: "archive", archiveReason: "source_deleted" });
  });

  it("archives an explicitly expired source with source_expired", () => {
    const d = decideRecheckOutcome(
      { consecutiveFailures: 0, failureStreakStartedAt: null },
      "expired",
      now
    );
    expect(d).toMatchObject({ action: "archive", archiveReason: "source_expired" });
  });

  it("NEVER archives on unknown — records a failure, keeps the item", () => {
    const d = decideRecheckOutcome(
      { consecutiveFailures: 0, failureStreakStartedAt: null },
      "unknown",
      now
    );
    expect(d.action).toBe("record-failure");
  });

  it("NEVER archives on fetch_failed — records a failure, keeps the item", () => {
    const d = decideRecheckOutcome(
      { consecutiveFailures: 0, failureStreakStartedAt: null },
      "fetch_failed",
      now
    );
    expect(d.action).toBe("record-failure");
  });

  it("NEVER archives even after many repeated failures over a long window", () => {
    const streakStart = new Date(now.getTime() - 100 * HOUR);
    for (const status of ["unknown", "fetch_failed"] as const) {
      const d = decideRecheckOutcome(
        { consecutiveFailures: 99, failureStreakStartedAt: streakStart },
        status,
        now
      );
      expect(d.action).toBe("record-failure");
      if (d.action === "record-failure") {
        expect(d.consecutiveFailures).toBe(100);
        expect(d.failureStreakStartedAt).toEqual(streakStart);
      }
    }
  });
});
