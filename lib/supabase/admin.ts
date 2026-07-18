import { createClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";
import type { DbClient, LooseDB } from "@/lib/supabase/server";
import { serverWebSocket } from "@/lib/supabase/websocket";

/**
 * Service-role Supabase client for ADMIN writes and privileged reads.
 *
 * SECURITY: uses SUPABASE_SERVICE_ROLE_KEY, which BYPASSES Row Level Security.
 * It must only ever run on the server (the admin DAL, admin server actions, the
 * seed script). Never import this module into a client component — the guard
 * below throws if it is somehow evaluated in the browser.
 *
 * Unlike the anon client in ./server.ts (limited by RLS to published/approved
 * rows), this client can read unpublished drafts and write to every table. That
 * is exactly why it is kept separate and only ever reached behind requireAdmin()
 * (see lib/admin/auth.ts). No scraping / agents / external source calls live
 * here — it talks only to our own Supabase project.
 */

let cached: DbClient | null = null;

/** Returns the cached service-role client. Throws if called in the browser. */
export function getSupabaseAdmin(): DbClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "getSupabaseAdmin() must never run in the browser — it uses the service-role key."
    );
  }
  if (!cached) {
    cached = createClient<LooseDB>(
      supabaseUrl(),
      supabaseServiceRoleKey(),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { transport: serverWebSocket },
      }
    ) as unknown as DbClient;
  }
  return cached;
}
