import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv, supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Proxy (formerly "middleware") — optimistic auth gate for /admin/*.
 *
 * Runs before admin routes render. It refreshes the Supabase Auth session and
 * redirects unauthenticated visitors to the login page. It deliberately does
 * NOT query the database or check the admins allowlist — that is requireAdmin()'s
 * job at the data layer (lib/admin/auth.ts), because proxy must stay optimistic
 * and a matcher change must never silently drop the real authorization check.
 *
 * The matcher is scoped to /admin, so the public site (/deals, /search, …) is
 * untouched and its static fallback keeps working. No scraping / agents /
 * external source calls — the only network call is to Supabase Auth to validate
 * the session token.
 */

// Paths under /admin reachable without a session (login + magic-link callback).
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/auth/callback"];

function isPublicAdminPath(pathname: string): boolean {
  return PUBLIC_ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Login and the magic-link callback are always allowed through.
  if (isPublicAdminPath(pathname)) {
    return NextResponse.next();
  }

  // Without Supabase configured the admin panel can't function — send to login.
  if (!hasSupabaseEnv()) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Cache-control headers Supabase asks us to set so auth responses are
        // never cached by a CDN / reverse proxy.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Must run before returning: validates the token with Supabase Auth and
  // triggers the cookie refresh in setAll above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
