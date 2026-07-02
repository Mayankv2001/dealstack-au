"use server";

import { redirect } from "next/navigation";
import { checkAdminRateLimit } from "@/lib/admin/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";

/**
 * Magic-link sign-in action.
 *
 * SECURITY: this never reveals whether the email belongs to an admin (or even
 * whether it exists). On any outcome — success, Supabase error, or invalid
 * input shape — it redirects to the same "check your inbox" state. The real
 * authorization gate is the admins allowlist enforced by requireAdmin() in the
 * protected layout, plus the magic-link callback. No external source calls.
 *
 * Hardening:
 *   - shouldCreateUser: false — this form can NOT create Supabase Auth users.
 *     Admin auth users are provisioned by hand in the Supabase dashboard (see
 *     docs/production-readiness.md §2); magic links are only ever sent to
 *     accounts that already exist, so strangers can't mint users or trigger
 *     mails to arbitrary addresses.
 *   - Throttled per submitted email via the admin_rate_limits ledger (stricter
 *     bucket than the authenticated admin-mutation limit). The limiter fails
 *     OPEN on storage errors, so a limiter outage can never lock an admin out.
 *     The throttle message is the same for every email — no enumeration.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Magic-link sends allowed per email per window (deliberately strict). */
const LOGIN_RATE_LIMIT_MAX = 5;
/** Rolling window for login sends, in seconds (15 minutes). */
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(
      `/admin/login?error=${encodeURIComponent("Enter a valid email address.")}`
    );
  }

  // Throttle BEFORE any Supabase call. Keyed on the submitted email with its
  // own bucket, so it never competes with an authenticated admin's mutation
  // budget. Applies identically to every email — reveals nothing.
  const rateLimit = await checkAdminRateLimit({
    adminEmail: email,
    actionKey: "login_magic_link",
    max: LOGIN_RATE_LIMIT_MAX,
    windowSeconds: LOGIN_RATE_LIMIT_WINDOW_SECONDS,
  });
  if (!rateLimit.success) {
    redirect(
      `/admin/login?error=${encodeURIComponent(
        "Too many sign-in attempts for that email. Wait a few minutes, then try again."
      )}`
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // PKCE magic link lands on the callback, which exchanges code -> session.
      emailRedirectTo: `${SITE_URL}/admin/auth/callback`,
      // Never self-provision: the auth user must already exist (created by
      // hand in the Supabase dashboard). The admins allowlist is what actually
      // authorizes access (see lib/admin/auth.ts).
      shouldCreateUser: false,
    },
  });

  if (error) {
    // Log server-side only — do not leak details to the client. A non-existent
    // user lands here too; the response below stays identical on purpose.
    console.error("[admin/login] signInWithOtp failed:", error.message);
  }

  // Identical response regardless of outcome (no account enumeration).
  redirect("/admin/login?sent=1");
}
