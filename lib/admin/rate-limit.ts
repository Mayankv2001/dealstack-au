import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Admin mutation rate limiting — SERVICE-ROLE ONLY, SERVER-ONLY.
 *
 * Throttles admin Server Actions to a fixed budget per authenticated admin
 * email, using a Postgres ledger (admin_rate_limits, migration 006) so the
 * limit holds across stateless serverless invocations — an in-memory Map() on
 * Vercel would reset per cold start and per region, so it is deliberately NOT
 * used here.
 *
 * Call AFTER requireAdmin() and BEFORE the database mutation:
 *
 *   const { email } = await requireAdmin();
 *   const rl = await checkAdminRateLimit({ adminEmail: email });
 *   if (!rl.success) return { error: rl.error };
 *   await repo.save(...);
 *
 * Design notes:
 *   - FAIL-OPEN: any storage error (including the table not existing yet)
 *     returns success. A rate-limiter outage must never lock trusted admins
 *     out of their own panel; availability beats strict throttling here.
 *   - It only ever talks to our own Supabase project via getSupabaseAdmin()
 *     (which throws if evaluated in the browser). No external calls.
 *   - The store/clock are injectable so the algorithm is unit-testable without
 *     a live database (see tests/admin/rate-limit.test.ts).
 */

/** Requests allowed per window, per admin email. */
export const ADMIN_RATE_LIMIT_MAX = 30;
/** Rolling window length, in seconds. */
export const ADMIN_RATE_LIMIT_WINDOW_SECONDS = 60;
/** Default bucket — a single key makes the limit per-email across all mutations. */
export const DEFAULT_ADMIN_ACTION_KEY = "admin_mutation";

/** User-facing message shown by the admin forms / toggles when throttled. */
export const RATE_LIMIT_MESSAGE =
  "Rate limit exceeded. Please wait a moment before saving again.";

/** Typed result of a rate-limit check. */
export type AdminRateLimitResult =
  | { success: true }
  | { success: false; error: string; retryAfterSeconds?: number };

/**
 * Shared result shape for admin actions that previously returned `void`.
 * Mirrors the existing offer-changes action result so the UI can treat them
 * uniformly: `{ ok: true }` on success, `{ error }` on a (rate-limit) failure.
 */
export type AdminActionResult = { ok: true } | { error: string };

/**
 * Minimal persistence surface the algorithm needs. The default implementation
 * is Supabase-backed; tests inject a fake to avoid any network.
 */
export interface RateLimitStore {
  /** Number of recorded attempts for this key at/after `sinceIso`. */
  countSince(params: {
    adminEmail: string;
    actionKey: string;
    sinceIso: string;
  }): Promise<number>;
  /** Record one attempt (only called when under the limit). */
  record(params: { adminEmail: string; actionKey: string }): Promise<void>;
  /** Optional opportunistic prune of rows older than `beforeIso`. */
  cleanup?(beforeIso: string): Promise<void>;
}

/** The production store: counts/records/prunes rows in admin_rate_limits. */
function supabaseRateLimitStore(): RateLimitStore {
  return {
    async countSince({ adminEmail, actionKey, sinceIso }) {
      const db = getSupabaseAdmin();
      const { count, error } = await db
        .from("admin_rate_limits")
        .select("*", { count: "exact", head: true })
        .eq("admin_email", adminEmail)
        .eq("action_key", actionKey)
        .gte("created_at", sinceIso);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async record({ adminEmail, actionKey }) {
      const db = getSupabaseAdmin();
      const { error } = await db
        .from("admin_rate_limits")
        .insert({ admin_email: adminEmail, action_key: actionKey });
      if (error) throw new Error(error.message);
    },
    async cleanup(beforeIso) {
      const db = getSupabaseAdmin();
      // Best-effort: ignore errors, this is housekeeping only.
      await db.from("admin_rate_limits").delete().lt("created_at", beforeIso);
    },
  };
}

export interface CheckAdminRateLimitParams {
  /** Authenticated admin email from requireAdmin(). */
  adminEmail: string;
  /** Bucket for the limit. Defaults to a single shared per-email bucket. */
  actionKey?: string;
  /** Injectable clock (tests). Defaults to the current time. */
  now?: Date;
  /** Injectable store (tests). Defaults to the Supabase-backed store. */
  store?: RateLimitStore;
}

/**
 * Returns `{ success: true }` when the admin is under the limit (and records the
 * attempt), or a typed error when the window is full. Never throws — storage
 * failures fail open.
 */
export async function checkAdminRateLimit(
  params: CheckAdminRateLimitParams
): Promise<AdminRateLimitResult> {
  const adminEmail = params.adminEmail?.trim().toLowerCase();
  // No verified identity → nothing to key on. Caller is expected to have run
  // requireAdmin() first; treat a missing email as "allow" (fail open).
  if (!adminEmail) return { success: true };

  const actionKey = params.actionKey ?? DEFAULT_ADMIN_ACTION_KEY;
  const now = params.now ?? new Date();
  const store = params.store ?? supabaseRateLimitStore();

  const sinceIso = new Date(
    now.getTime() - ADMIN_RATE_LIMIT_WINDOW_SECONDS * 1000
  ).toISOString();

  try {
    const count = await store.countSince({ adminEmail, actionKey, sinceIso });

    if (count >= ADMIN_RATE_LIMIT_MAX) {
      return {
        success: false,
        error: RATE_LIMIT_MESSAGE,
        retryAfterSeconds: ADMIN_RATE_LIMIT_WINDOW_SECONDS,
      };
    }

    await store.record({ adminEmail, actionKey });

    // Opportunistic, low-overhead prune: only when this admin's window is empty
    // (rare), drop rows older than a day so the table cannot grow unbounded.
    if (count === 0 && store.cleanup) {
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      try {
        await store.cleanup(cutoff);
      } catch {
        // Housekeeping only — never affects the action.
      }
    }

    return { success: true };
  } catch (err) {
    // FAIL-OPEN: never block an authenticated admin because the limiter broke
    // (e.g. the migration has not been applied yet).
    console.error("[admin/rate-limit] check failed, allowing request:", err);
    return { success: true };
  }
}
