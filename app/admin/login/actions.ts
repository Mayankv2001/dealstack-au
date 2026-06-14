"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";

/**
 * Magic-link sign-in action.
 *
 * SECURITY: this never reveals whether the email belongs to an admin (or even
 * whether it exists). On any outcome — success, Supabase error, or invalid
 * input shape — it redirects to the same "check your inbox" state. The real
 * authorization gate is the admins allowlist enforced by requireAdmin() in the
 * protected layout, plus the magic-link callback. No external source calls.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(
      `/admin/login?error=${encodeURIComponent("Enter a valid email address.")}`
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // PKCE magic link lands on the callback, which exchanges code -> session.
      emailRedirectTo: `${SITE_URL}/admin/auth/callback`,
      // First sign-in self-provisions the auth user; the admins allowlist is
      // what actually authorizes access (see lib/admin/auth.ts).
      shouldCreateUser: true,
    },
  });

  if (error) {
    // Log server-side only — do not leak details to the client.
    console.error("[admin/login] signInWithOtp failed:", error.message);
  }

  // Identical response regardless of outcome (no account enumeration).
  redirect("/admin/login?sent=1");
}
