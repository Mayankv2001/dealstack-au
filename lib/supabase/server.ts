import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasSupabaseEnv, supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Server-side Supabase access for PUBLIC reads.
 *
 * Uses the anon key, so RLS applies — only published/approved rows come back.
 * Server/data-layer use only; never import this into a client component. No
 * service-role key here (that stays in scripts/admin actions).
 */

// Permissive schema so dynamic table names type-check without generated types.
// Exported so the service-role (./admin.ts) and SSR auth (./ssr.ts) clients
// share one loose schema type — no behaviour change to public reads here.
type Row = Record<string, unknown>;
export type LooseDB = {
  public: {
    Tables: Record<
      string,
      { Row: Row; Insert: Row; Update: Row; Relationships: [] }
    >;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
export type DbClient = SupabaseClient<LooseDB>;

let cached: DbClient | null = null;

/** Returns a Supabase client, or null when Supabase env vars are absent. */
export function getSupabaseServer(): DbClient | null {
  if (!hasSupabaseEnv()) return null;
  if (!cached) {
    cached = createClient<LooseDB>(supabaseUrl(), supabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

/** Explicit override: DATA_SOURCE=static forces the static fallback everywhere. */
export function isStaticDataSource(): boolean {
  return process.env.DATA_SOURCE === "static";
}

/**
 * Run a DB read with graceful fallback to static data. Falls back when:
 *   - DATA_SOURCE=static, or
 *   - Supabase env vars are missing (client is null), or
 *   - the query throws, or
 *   - the query returns zero rows.
 */
export async function fromDbOrStatic<T>(
  label: string,
  staticData: T[],
  query: (supabase: DbClient) => Promise<T[]>
): Promise<T[]> {
  if (isStaticDataSource()) return staticData;
  const supabase = getSupabaseServer();
  if (!supabase) return staticData;
  try {
    const rows = await query(supabase);
    if (!rows || rows.length === 0) return staticData;
    return rows;
  } catch (err) {
    console.warn(
      `[repos] ${label}: DB read failed, using static fallback. ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return staticData;
  }
}

// ── DB value coercion (Postgres `numeric` arrives as a string) ───────────────
export function toNumber(value: unknown): number {
  return value == null ? 0 : Number(value);
}

export function toNumberOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}
