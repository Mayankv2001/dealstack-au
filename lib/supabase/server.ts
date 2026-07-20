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

// ── Data-source mode ─────────────────────────────────────────────────────────

export type DataSourceMode = "database" | "static";

/**
 * Exact acknowledgement value required (in DATA_SOURCE_STATIC_PREVIEW_ACK)
 * before a PRODUCTION RUNTIME may serve static demo data. Deliberately a
 * sentence, not a boolean, so it cannot be enabled by accident.
 */
export const STATIC_PREVIEW_ACK = "serve-demo-data-not-production";

export interface DataSourceEnv {
  /** process.env.NODE_ENV */
  nodeEnv: string | undefined;
  /** process.env.DATA_SOURCE */
  dataSource: string | undefined;
  /** process.env.DATA_SOURCE_STATIC_PREVIEW_ACK */
  staticPreviewAck: string | undefined;
  /** True during `next build` (NEXT_PHASE=phase-production-build). */
  isBuildPhase: boolean;
}

function readDataSourceEnv(): DataSourceEnv {
  return {
    nodeEnv: process.env.NODE_ENV,
    dataSource: process.env.DATA_SOURCE,
    staticPreviewAck: process.env.DATA_SOURCE_STATIC_PREVIEW_ACK,
    isBuildPhase: process.env.NEXT_PHASE === "phase-production-build",
  };
}

/** Production RUNTIME = serving real traffic; a `next build` is not serving. */
function isProductionRuntime(env: DataSourceEnv): boolean {
  return env.nodeEnv === "production" && !env.isBuildPhase;
}

/**
 * The single data-source decision, FAIL-CLOSED. Pure so tests can drive every
 * branch without real credentials.
 *
 *   - unset/blank DATA_SOURCE → "database";
 *   - DATA_SOURCE=static → "static" in dev/test and during `next build`;
 *     in a production RUNTIME only with the exact
 *     DATA_SOURCE_STATIC_PREVIEW_ACK sentence (Playwright's static server and
 *     the CI smoke server set it explicitly) — otherwise this THROWS;
 *   - any other value (misspellings included) THROWS — an unrecognised mode
 *     must never silently pick fixtures or the database.
 *
 * Error messages name variables, never values.
 */
export function resolveDataSourceMode(env: DataSourceEnv): DataSourceMode {
  const raw = (env.dataSource ?? "").trim();
  if (raw === "") return "database";
  if (raw !== "static") {
    throw new Error(
      `Unsupported DATA_SOURCE value. Use "static" for explicit demo mode or leave it unset for the database.`,
    );
  }
  if (!isProductionRuntime(env)) return "static";
  if (env.staticPreviewAck === STATIC_PREVIEW_ACK) return "static";
  throw new Error(
    "DATA_SOURCE=static is not authorised in a production runtime. " +
      "Static demo data is for tests/previews only; set " +
      "DATA_SOURCE_STATIC_PREVIEW_ACK to the documented acknowledgement " +
      "sentence to run an intentional static preview server.",
  );
}

/** Explicit override: DATA_SOURCE=static forces local/demo arrays everywhere.
 * Fail-closed: throws (rather than guessing) on unsupported values and on an
 * unacknowledged static production runtime. */
export function isStaticDataSource(): boolean {
  return resolveDataSourceMode(readDataSourceEnv()) === "static";
}

/**
 * Public-repository fallback policy. Static arrays are ONLY local/demo
 * substitutes, never production fallbacks:
 *   - explicit static mode (see resolveDataSourceMode) → demo data;
 *   - database mode + Supabase env absent:
 *       · production runtime → THROW — a misconfigured deployment must fail
 *         closed, never silently serve plausible demo offers;
 *       · dev/test/build     → demo data (local demo mode);
 *   - Supabase configured + query succeeds → the DB rows, even when EMPTY —
 *     zero published rows must render the empty state, not resurrect demos;
 *   - Supabase configured + query throws   → [] (never the demo data).
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
  if (!supabase) {
    if (deps.client === undefined && isProductionRuntime(readDataSourceEnv())) {
      // Names only — never env values.
      throw new Error(
        "Supabase configuration is missing (NEXT_PUBLIC_SUPABASE_URL / " +
          "NEXT_PUBLIC_SUPABASE_ANON_KEY). Refusing to serve demo data in a " +
          "production runtime.",
      );
    }
    return demoData;
  }
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
