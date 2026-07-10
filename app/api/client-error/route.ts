import { NextRequest, NextResponse } from "next/server";

/**
 * Client-error intake — the beacon target for instrumentation-client.ts.
 *
 * Writes one structured console.error line per accepted report so client-side
 * failures become visible in the Vercel function logs alongside server errors
 * (grep "[client-error]").
 *
 * This is a public, unauthenticated endpoint, so it is defensive by design:
 *   - tiny body cap, string-field allowlist, everything else dropped;
 *   - per-instance in-memory throttle (serverless instances are short-lived,
 *     so this is a noise cap, not a security boundary);
 *   - always responds 204 — a reporter must never give attackers an oracle or
 *     the client a reason to retry.
 */

const MAX_BODY_BYTES = 4 * 1024;
const MAX_REPORTS_PER_MINUTE = 30;

let windowStart = 0;
let windowCount = 0;

function underLimit(now: number): boolean {
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount <= MAX_REPORTS_PER_MINUTE;
}

const pick = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : undefined;

export async function POST(request: NextRequest) {
  const done = new NextResponse(null, { status: 204 });
  try {
    if (!underLimit(Date.now())) return done;

    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_BYTES) return done;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return done;
    const body = parsed as Record<string, unknown>;

    const message = pick(body.message, 500);
    if (!message) return done;

    console.error(
      `[client-error] ${JSON.stringify({
        type: pick(body.type, 30) ?? "error",
        message,
        stack: pick(body.stack, 1500),
        url: pick(body.url, 200),
        ua: request.headers.get("user-agent")?.slice(0, 150),
      })}`
    );
  } catch {
    // Malformed input is dropped silently — still a 204.
  }
  return done;
}
