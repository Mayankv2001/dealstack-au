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

function contentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "report-uri /api/csp-report",
  ].join("; ");
}

function addCsp(response: NextResponse, value: string): NextResponse {
  response.headers.set("Content-Security-Policy-Report-Only", value);
  return response;
}

function isPublicAdminPath(pathname: string): boolean {
  return PUBLIC_ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const next = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    // Next parses this request header and applies the nonce to framework scripts.
    // Browsers receive only Report-Only while violations are measured.
    requestHeaders.set("Content-Security-Policy", csp);
    return addCsp(
      NextResponse.next({ request: { headers: requestHeaders } }),
      csp
    );
  };

  // Login and the magic-link callback are always allowed through.
  if (isPublicAdminPath(pathname)) {
    return next();
  }

  if (!pathname.startsWith("/admin")) return next();

  // Without Supabase configured the admin panel can't function — send to login.
  if (!hasSupabaseEnv()) {
    return addCsp(
      NextResponse.redirect(new URL("/admin/login", request.url)),
      csp
    );
  }

  let response = next();

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = next();
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
    return addCsp(
      NextResponse.redirect(new URL("/admin/login", request.url)),
      csp
    );
  }

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
