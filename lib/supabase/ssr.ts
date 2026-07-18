import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { LooseDB } from "@/lib/supabase/server";
import { serverWebSocket } from "@/lib/supabase/websocket";

/**
 * Per-request Supabase client bound to the request cookies — for AUTH only.
 *
 * Uses the anon key plus the Supabase Auth session cookie so we can tell who is
 * logged in (supabase.auth.getUser()) and run the magic-link sign-in / sign-out
 * flows. RLS still applies to anything read through this client, so it is NOT
 * used for admin data access — that goes through the service-role client in
 * ./admin.ts.
 *
 * A fresh client is created per call because it closes over the current
 * request's cookie store; do NOT cache it as a module singleton.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<LooseDB>(supabaseUrl(), supabaseAnonKey(), {
    realtime: { transport: serverWebSocket },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // During a Server Component render the cookie store is read-only and
        // these writes throw. That's expected: proxy.ts refreshes the session
        // on every /admin request, so the Server Component can ignore it. In a
        // Server Action / Route Handler the writes succeed.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Not in a writable cookie context — safe to ignore.
        }
      },
    },
  });
}
