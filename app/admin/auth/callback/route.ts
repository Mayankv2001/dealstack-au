import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";

/**
 * Magic-link callback. Supabase redirects here with a PKCE `code` (the SSR
 * client uses the pkce flow). We exchange it for a session — which writes the
 * auth cookies via the SSR cookie adapter — then send the user to the
 * dashboard. The protected layout's requireAdmin() still blocks anyone whose
 * email is not in the admins allowlist, so a valid session alone is not access.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const authError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");

  const loginWithError = (message: string) =>
    NextResponse.redirect(
      new URL(`/admin/login?error=${encodeURIComponent(message)}`, url.origin)
    );

  if (authError) {
    return loginWithError("Sign-in link was invalid or has expired.");
  }
  if (!code) {
    return loginWithError("Missing sign-in code — request a new link.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[admin/auth/callback] exchange failed:", error.message);
    return loginWithError("Could not complete sign-in — request a new link.");
  }

  return NextResponse.redirect(new URL("/admin/dashboard", url.origin));
}
