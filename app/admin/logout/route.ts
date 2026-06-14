import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr";

/**
 * Signs the current user out (clears the Supabase auth cookies via the SSR
 * cookie adapter) and returns to the login page. POST-only so route prefetch
 * can never trigger a logout; the admin nav posts a form here. 303 converts the
 * POST into a GET redirect.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const url = new URL(request.url);
  return NextResponse.redirect(new URL("/admin/login", url.origin), {
    status: 303,
  });
}
