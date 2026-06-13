/**
 * Centralised environment access.
 *
 * Helpers are lazy (functions, not top-level reads) so importing this module
 * never throws at build time when variables are absent — public pages keep
 * working via the static fallback, and only code that actually needs Supabase
 * (the seed script, future repos/admin actions) calls these.
 *
 * SECURITY: `supabaseServiceRoleKey()` is for server/script use ONLY. Never
 * import it into a client component or expose it to the browser.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in .env.local (see .env.example) or your hosting provider.`
    );
  }
  return value;
}

/** True when both public Supabase vars are present (used to decide DB vs static). */
export function hasSupabaseEnv(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export const supabaseUrl = (): string =>
  requireEnv("NEXT_PUBLIC_SUPABASE_URL");

export const supabaseAnonKey = (): string =>
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

/** SERVER/SCRIPT ONLY — never reference from client code. */
export const supabaseServiceRoleKey = (): string =>
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
