import { NextRequest } from "next/server";
import { sanitizeDiagnostic, sanitizePath } from "@/lib/observability/sanitize";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_REPORTS_PER_MINUTE = 60;
let windowStart = 0;
let reportCount = 0;

function underLimit(now: number): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now;
    reportCount = 0;
  }
  reportCount += 1;
  return reportCount <= MAX_REPORTS_PER_MINUTE;
}

export async function POST(request: NextRequest): Promise<Response> {
  const done = new Response(null, { status: 204 });
  try {
    if (!underLimit(Date.now())) return done;
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_BYTES) return done;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const report = (parsed["csp-report"] ?? parsed.body ?? parsed) as Record<string, unknown>;
    console.warn(
      `[csp-report] ${JSON.stringify({
        directive: sanitizeDiagnostic(report["violated-directive"] ?? report.effectiveDirective, 100),
        blocked: sanitizeDiagnostic(report["blocked-uri"] ?? report.blockedURL, 200),
        document: sanitizePath(
          sanitizeDiagnostic(report["document-uri"] ?? report.documentURL, 300)
        ),
      })}`
    );
  } catch {
    // Reports are untrusted diagnostics; malformed input is dropped.
  }
  return done;
}

