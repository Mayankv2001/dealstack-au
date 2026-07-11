import { cache } from "react";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";
import { setAdminAuditActor } from "@/lib/admin/audit-context";

/**
 * Admin authentication / authorization Data Access Layer.
 *
 * Two-step gate: a request is an admin only when (a) there is a valid Supabase
 * Auth session and (b) that user's email is present in the `admins` allowlist
 * table. The allowlist lookup uses the service-role client because `admins` has
 * no public RLS read policy — it is intentionally unreadable to anon and
 * authenticated roles.
 *
 * Call requireAdmin() in EVERY admin page, server action, and route handler.
 * proxy.ts is only an optimistic first check and must never be the sole line of
 * defence (per the Next.js authentication guide).
 */

export interface AdminSession {
  email: string;
  role: string;
}

/** Current admin session, or null. Memoised per request via React cache. */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase();
  if (!email) return null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("admins")
    .select("email, role")
    .eq("email", email)
    .maybeSingle();

  const row = data as { role?: unknown } | null;
  if (error || !row) return null;

  const role = typeof row.role === "string" ? row.role : "admin";
  return { email, role };
});

/** Hard gate: redirects to /admin/login when there is no authenticated admin. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  setAdminAuditActor(session.email);
  return session;
}
