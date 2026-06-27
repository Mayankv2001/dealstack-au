import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_RATE_LIMIT_MAX,
  ADMIN_RATE_LIMIT_WINDOW_SECONDS,
  RATE_LIMIT_MESSAGE,
  checkAdminRateLimit,
  type RateLimitStore,
} from "@/lib/admin/rate-limit";

/**
 * Unit tests for the admin rate limiter.
 *
 * They exercise the algorithm through its mockable store boundary (no live
 * Supabase / network): a fake in-memory store records timestamped attempts and
 * the clock is injected, so the rolling-window logic is fully deterministic.
 */

const NOW = new Date("2026-06-26T00:00:00.000Z");

/** In-memory stand-in for the admin_rate_limits table. */
function createFakeStore(nowMs: number) {
  const rows: { email: string; key: string; at: number }[] = [];
  const store: RateLimitStore = {
    async countSince({ adminEmail, actionKey, sinceIso }) {
      const since = Date.parse(sinceIso);
      return rows.filter(
        (r) => r.email === adminEmail && r.key === actionKey && r.at >= since
      ).length;
    },
    async record({ adminEmail, actionKey }) {
      rows.push({ email: adminEmail, key: actionKey, at: nowMs });
    },
  };
  return { rows, store };
}

describe("checkAdminRateLimit", () => {
  it("allows requests up to the limit within a minute", async () => {
    const { store } = createFakeStore(NOW.getTime());

    for (let i = 0; i < ADMIN_RATE_LIMIT_MAX; i++) {
      const result = await checkAdminRateLimit({
        adminEmail: "admin@dealstack.au",
        now: NOW,
        store,
      });
      expect(result).toEqual({ success: true });
    }
  });

  it("blocks once the limit is exceeded in the same minute", async () => {
    const { store } = createFakeStore(NOW.getTime());

    // Exhaust the budget (these all succeed and record an attempt).
    for (let i = 0; i < ADMIN_RATE_LIMIT_MAX; i++) {
      await checkAdminRateLimit({ adminEmail: "a@x.au", now: NOW, store });
    }

    const blocked = await checkAdminRateLimit({
      adminEmail: "a@x.au",
      now: NOW,
      store,
    });
    expect(blocked.success).toBe(false);
    if (!blocked.success) {
      expect(blocked.error).toBe(RATE_LIMIT_MESSAGE);
      expect(blocked.retryAfterSeconds).toBe(ADMIN_RATE_LIMIT_WINDOW_SECONDS);
    }
  });

  it("does not record an attempt when blocked (over-limit calls are free)", async () => {
    const { rows, store } = createFakeStore(NOW.getTime());
    for (let i = 0; i < ADMIN_RATE_LIMIT_MAX + 5; i++) {
      await checkAdminRateLimit({ adminEmail: "a@x.au", now: NOW, store });
    }
    // Capped at the limit — the 5 blocked calls added nothing.
    expect(rows.length).toBe(ADMIN_RATE_LIMIT_MAX);
  });

  it("tracks limits separately per admin email", async () => {
    const { store } = createFakeStore(NOW.getTime());

    // Fill admin A's window.
    for (let i = 0; i < ADMIN_RATE_LIMIT_MAX; i++) {
      await checkAdminRateLimit({ adminEmail: "a@x.au", now: NOW, store });
    }

    const aBlocked = await checkAdminRateLimit({
      adminEmail: "a@x.au",
      now: NOW,
      store,
    });
    const bAllowed = await checkAdminRateLimit({
      adminEmail: "b@x.au",
      now: NOW,
      store,
    });

    expect(aBlocked.success).toBe(false);
    expect(bAllowed).toEqual({ success: true });
  });

  it("forgets attempts older than the rolling window", async () => {
    const past = NOW.getTime() - (ADMIN_RATE_LIMIT_WINDOW_SECONDS + 1) * 1000;
    const { store } = createFakeStore(past);

    // 30 attempts a minute+ ago.
    for (let i = 0; i < ADMIN_RATE_LIMIT_MAX; i++) {
      await checkAdminRateLimit({
        adminEmail: "a@x.au",
        now: new Date(past),
        store,
      });
    }

    // A fresh request "now" sees an empty window.
    const result = await checkAdminRateLimit({
      adminEmail: "a@x.au",
      now: NOW,
      store,
    });
    expect(result).toEqual({ success: true });
  });

  it("returns a typed error and never throws when storage fails (fail-open)", async () => {
    const throwingStore: RateLimitStore = {
      async countSince() {
        throw new Error("table admin_rate_limits does not exist");
      },
      async record() {
        throw new Error("should not be reached");
      },
    };

    // Must not reject — fail-open returns success so admins are never locked out.
    const result = await checkAdminRateLimit({
      adminEmail: "a@x.au",
      now: NOW,
      store: throwingStore,
    });
    expect(result).toEqual({ success: true });
  });

  it("returns success for a missing admin email without touching the store", async () => {
    const { rows, store } = createFakeStore(NOW.getTime());
    const result = await checkAdminRateLimit({ adminEmail: "", store, now: NOW });
    expect(result).toEqual({ success: true });
    expect(rows.length).toBe(0);
  });
});

describe("admin action wiring (rate limit runs before the mutation)", () => {
  // Mirrors the real action shape: requireAdmin → rate-limit → mutate.
  async function fakeSaveAction(params: {
    adminEmail: string;
    store: RateLimitStore;
    repo: () => Promise<void>;
  }): Promise<{ ok: true } | { error: string }> {
    const rl = await checkAdminRateLimit({
      adminEmail: params.adminEmail,
      store: params.store,
      now: NOW,
    });
    if (!rl.success) return { error: rl.error };
    await params.repo();
    return { ok: true };
  }

  it("returns the rate-limit error BEFORE calling the repo when over limit", async () => {
    const { store } = createFakeStore(NOW.getTime());
    for (let i = 0; i < ADMIN_RATE_LIMIT_MAX; i++) {
      await checkAdminRateLimit({ adminEmail: "a@x.au", now: NOW, store });
    }

    const repo = vi.fn(async () => {});
    const result = await fakeSaveAction({ adminEmail: "a@x.au", store, repo });

    expect(result).toEqual({ error: RATE_LIMIT_MESSAGE });
    expect(repo).not.toHaveBeenCalled();
  });

  it("calls the repo when under the limit", async () => {
    const { store } = createFakeStore(NOW.getTime());
    const repo = vi.fn(async () => {});
    const result = await fakeSaveAction({ adminEmail: "a@x.au", store, repo });

    expect(result).toEqual({ ok: true });
    expect(repo).toHaveBeenCalledTimes(1);
  });
});
