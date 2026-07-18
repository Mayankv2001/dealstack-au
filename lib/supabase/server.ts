import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasSupabaseEnv, supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { serverWebSocket } from "@/lib/supabase/websocket";

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
    cached = createClient<LooseDB>(
      supabaseUrl(),
      supabaseAnonKey(),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { transport: serverWebSocket },
      }
    ) as unknown as DbClient;
  }
  return cached;
}

/** Explicit override: DATA_SOURCE=static forces the static fallback everywhere. */
export function isStaticDataSource(): boolean {
  return process.env.DATA_SOURCE === "static";
}

/**
 * Static samples are an explicit demo mode in production. Local development
 * remains convenient when Supabase has not been configured yet.
 */
export function shouldUseStaticData(): boolean {
  if (isStaticDataSource()) return true;
  if (process.env.DATA_SOURCE === "supabase") return false;
  return process.env.NODE_ENV !== "production" && !hasSupabaseEnv();
}

/**
 * Run a public DB read. Static data is returned only in explicit static mode,
 * or for an unconfigured local development environment. A legitimate empty
 * result stays empty, and production failures stay empty instead of reviving
 * expired sample offers.
 */
export async function fromDbOrStatic<T>(
  label: string,
  staticData: T[],
  query: (supabase: DbClient) => Promise<T[]>
): Promise<T[]> {
  if (shouldUseStaticData()) return staticData;
  const supabase = getSupabaseServer();
  if (!supabase) {
    console.warn(
      `[repos] ${label}: Supabase is not configured; returning an empty public result.`
    );
    return [];
  }
  try {
    const rows = await query(supabase);
    return rows ?? [];
  } catch (err) {
    console.warn(
      `[repos] ${label}: DB read failed; returning an empty public result. ${
        err instanceof Error ? err.message : String(err)
      }`
    );
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
