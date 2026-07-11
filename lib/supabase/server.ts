import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasSupabaseEnv, supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { reportOperationalError } from "@/lib/observability/report-server-error";

/**
 * Server-side Supabase access for PUBLIC reads.
 *
 * Uses the anon key, so RLS applies — only published/approved rows come back.
 * Server/data-layer use only; never import this into a client component. No
 * service-role key here (that stays in scripts/admin actions).
 */

export type DbClient = SupabaseClient<Database>;

/** Every public table name — lets helpers take a table name as a plain string param. */
export type PublicTable = keyof Database["public"]["Tables"] & string;

let cached: DbClient | null = null;

/** Returns a Supabase client, or null when Supabase env vars are absent. */
export function getSupabaseServer(): DbClient | null {
  if (!hasSupabaseEnv()) return null;
  if (!cached) {
    cached = createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

/** Explicit override: DATA_SOURCE=static forces local/demo arrays everywhere. */
export function isStaticDataSource(): boolean {
  return process.env.DATA_SOURCE === "static";
}

/**
 * Public-repository fallback policy. Static arrays are ONLY local/demo
 * substitutes, never production fallbacks:
 *   - DATA_SOURCE=static or Supabase env absent → demo data (local/demo mode);
 *   - Supabase configured + query succeeds      → the DB rows, even when EMPTY —
 *     zero published rows must render the empty state, not resurrect demos;
 *   - Supabase configured + query throws        → [] (never the demo data).
 * `deps` exists so tests can inject the mode/client; production callers omit it.
 */
export async function fromDbOrDemo<T>(
  label: string,
  demoData: T[],
  query: (supabase: DbClient) => Promise<T[]>,
  deps: { staticMode?: boolean; client?: DbClient | null } = {}
): Promise<T[]> {
  const staticMode = deps.staticMode ?? isStaticDataSource();
  if (staticMode) return demoData;
  const supabase = deps.client !== undefined ? deps.client : getSupabaseServer();
  if (!supabase) return demoData;
  try {
    return (await query(supabase)) ?? [];
  } catch (err) {
    await reportOperationalError(`public-repo-${label}`, err);
    return [];
  }
}

// ── DB value coercion (Postgres `numeric` arrives as a string) ───────────────
export function toNumber(value: unknown): number {
  return value == null ? 0 : Number(value);
}

export function toNumberOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}
