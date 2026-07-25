import { createHash } from "node:crypto";
import { cronSecret } from "@/lib/env";

/**
 * Per-day pseudonymous fingerprint for the public correction-report throttles.
 *
 * Deliberately does NOT hash User-Agent. A fingerprint is only useful if the
 * client cannot change it at will; User-Agent is a client-chosen string, so
 * including it meant rotating one header produced a fresh bucket on every
 * request and the 5-per-window cap never fired.
 *
 * IP resolution order matters for the same reason. On Vercel, `x-real-ip` and
 * `x-vercel-forwarded-for` are set by the platform and cannot be forged by the
 * caller. `x-forwarded-for` CAN be prepended to by the client, and the
 * platform appends the true peer address, so the LAST entry is the trustworthy
 * one — taking the first (the previous behaviour) let a caller mint a new
 * bucket per request by sending their own `x-forwarded-for`.
 */
export function clientRateLimitIp(headers: Headers): string {
  const platform =
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-vercel-forwarded-for")?.split(",").pop()?.trim();
  if (platform) return platform;
  const forwarded = headers.get("x-forwarded-for");
  return forwarded?.split(",").pop()?.trim() || "unknown";
}

/**
 * `salt` namespaces the buckets so the two report endpoints throttle
 * independently. `now` is injectable for tests.
 */
export function dailyRequestFingerprint(
  headers: Headers,
  salt: string,
  now: Date = new Date()
): string {
  const day = now.toISOString().slice(0, 10);
  return createHash("sha256")
    .update(`${cronSecret() ?? salt}|${salt}|${day}|${clientRateLimitIp(headers)}`)
    .digest("hex");
}
