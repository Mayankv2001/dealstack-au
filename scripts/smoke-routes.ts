/**
 * Read-only route/SEO/security-header smoke test — automates
 * FINAL-LAUNCH-CHECKLIST.md §7 (public route QA), §8 (robots/sitemap/OG/
 * host) and §9 (security headers) so they don't have to be clicked through
 * by hand after every phase.
 *
 * It only ever sends GET requests to our own app (local dev, local prod
 * build, or the live deployment) — no external hosts, no writes, no
 * crawling of links found in responses. No Supabase env required: the only
 * input is the base URL.
 *
 * Run:
 *   npm run smoke                                        # http://localhost:3000
 *   npm run smoke -- --base-url=https://<prod-domain>
 *
 * Opt-in strict content mode (see STRICT_CONTENT_BANNED_MARKERS below):
 *   npm run smoke -- --strict-content
 *   npm run smoke -- --strict-content --base-url=https://<prod-domain>
 */

import { fileURLToPath } from "node:url";

const USER_AGENT = "dealstack-smoke/1.0";
const TIMEOUT_MS = 15_000;

// True only when this file is the process entry point (`tsx scripts/smoke-routes.ts`),
// so tests can import its pure exports (constants, check functions) without
// triggering --help's process.exit or main()'s network calls.
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

// ── CLI args ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

if (isMainModule && (argv.includes("--help") || argv.includes("-h"))) {
  console.log(
    [
      "smoke-routes — read-only route/SEO/security-header smoke test.",
      "",
      "  npm run smoke                                    http://localhost:3000",
      "  npm run smoke -- --base-url=https://example.com",
      "  npm run smoke -- --strict-content                also scan for banned",
      "                                                     public trust markers",
      "                                                     (placeholder/demo/",
      "                                                     expired/unready-card",
      "                                                     content) — opt-in,",
      "                                                     off by default.",
      "",
      "GETs a fixed list of our own routes and prints PASS/FAIL per check.",
      "Exits 0 only if every check passes (warns, e.g. missing HSTS on a",
      "non-https base URL, do not fail the run).",
    ].join("\n")
  );
  process.exit(0);
}

function parseBaseUrl(args: string[]): string {
  const arg = args.find((a) => a.startsWith("--base-url="));
  const raw = arg ? arg.slice("--base-url=".length) : "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

const baseUrl = parseBaseUrl(argv);
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(baseUrl);
const strictContent = argv.includes("--strict-content");

// ── Fetch helper: manual redirects, timeout, one retry on network failure ────

async function fetchOnce(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": USER_AGENT },
  });
}

/**
 * Retries once on network error or timeout only — a cold dev server compiles
 * the route on first hit and can exceed the timeout; a genuine failure fails
 * twice. Never retries on an actual HTTP response (any status code).
 */
async function fetchWithRetry(path: string): Promise<Response> {
  try {
    return await fetchOnce(path);
  } catch {
    try {
      return await fetchOnce(path);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`network error fetching ${path}: ${detail}`);
    }
  }
}

// ── Check runner ─────────────────────────────────────────────────────────────

/** Thrown instead of Error to record a check as a warn, not a fail. */
class CheckWarning extends Error {}

type CheckStatus = "pass" | "fail" | "warn";
interface CheckResult {
  name: string;
  status: CheckStatus;
  detail?: string;
}

const results: CheckResult[] = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, status: "pass" });
    console.log(`✓ ${name}`);
  } catch (err) {
    if (err instanceof CheckWarning) {
      results.push({ name, status: "warn", detail: err.message });
      console.log(`⚠ ${name} — ${err.message}`);
      return;
    }
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, status: "fail", detail });
    console.log(`✗ ${name} — ${detail}`);
  }
}

// ── §7 public routes ─────────────────────────────────────────────────────────

// Markers are deliberately generic (brand name, store names) so routine copy
// edits don't break the suite — never assert on marketing headlines.
const PUBLIC_ROUTES: { path: string; marker: string }[] = [
  { path: "/", marker: "DealStack" },
  { path: "/deals", marker: "DealStack" },
  { path: "/search?q=myer", marker: "Myer" },
  { path: "/stores", marker: "All stores" },
  { path: "/cards", marker: "DealStack" },
  { path: "/resources", marker: "DealStack" },
  { path: "/privacy", marker: "Privacy" },
  { path: "/terms", marker: "Terms of use" },
  { path: "/editorial-policy", marker: "Editorial policy" },
  { path: "/stores/myer", marker: "Myer" },
  { path: "/stores/jb-hifi", marker: "JB" },
  { path: "/stores/woolworths", marker: "Woolworths" },
];

async function expectPublicRoute(path: string, marker: string): Promise<void> {
  const res = await fetchWithRetry(path);
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error(`expected text/html content-type, got "${contentType}"`);
  }
  const body = await res.text();
  if (!body.includes(marker)) {
    throw new Error(`marker "${marker}" not found in body`);
  }
  if (body.includes("Application error")) {
    throw new Error('body contains "Application error" (unhandled-error shell)');
  }
}

// ── §7 auth boundaries + §4 cron gate ────────────────────────────────────────

const ADMIN_ROUTES = ["/admin/dashboard", "/admin/card-offers", "/admin/signals/queue"];

async function expectAdminRedirect(path: string): Promise<void> {
  const res = await fetchWithRetry(path);
  if (res.status !== 307) {
    throw new Error(`expected 307 redirect, got ${res.status} (possible data leak if 2xx)`);
  }
  const location = res.headers.get("location") ?? "";
  if (!location.includes("/admin/login")) {
    throw new Error(`location header "${location}" does not contain /admin/login`);
  }
}

async function expectCronGateClosed(): Promise<void> {
  const res = await fetchWithRetry("/api/cron/monitor-feeds");
  if (res.status === 200) {
    throw new Error("cron gate is open without auth (got 200)");
  }
  if (res.status !== 401 && res.status !== 503) {
    throw new Error(`expected 401 or 503, got ${res.status}`);
  }
}

async function expectMonitorHealthGateClosed(): Promise<void> {
  const res = await fetchWithRetry("/api/health/monitor");
  if (res.status === 200) throw new Error("monitor health gate is open without auth");
  if (res.status !== 401 && res.status !== 503) {
    throw new Error(`expected 401 or 503, got ${res.status}`);
  }
}

async function expectDataHealthGateClosed(): Promise<void> {
  const res = await fetchWithRetry("/api/health/data");
  if (res.status === 200) throw new Error("data health gate is open without auth");
  if (res.status !== 401 && res.status !== 503) {
    throw new Error(`expected 401 or 503, got ${res.status}`);
  }
}

// ── §8 SEO endpoints ──────────────────────────────────────────────────────────

async function expectRobotsTxt(): Promise<void> {
  const res = await fetchWithRetry("/robots.txt");
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const body = await res.text();
  if (!body.includes("Disallow: /admin")) {
    throw new Error('missing "Disallow: /admin"');
  }
  const sitemapLine = body.split("\n").find((line) => line.trim().startsWith("Sitemap:"));
  if (!sitemapLine) throw new Error("missing Sitemap: line");
  if (!isLocal) {
    const host = new URL(baseUrl).host;
    if (!sitemapLine.includes(host)) {
      throw new Error(`Sitemap line "${sitemapLine.trim()}" does not contain host "${host}"`);
    }
    if (sitemapLine.includes("localhost")) {
      throw new Error(`Sitemap line leaks localhost: "${sitemapLine.trim()}"`);
    }
  }
}

async function expectSitemapXml(): Promise<void> {
  const res = await fetchWithRetry("/sitemap.xml");
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const body = await res.text();
  if (!body.includes("<loc>")) throw new Error("missing <loc> entries");
  if (!body.includes("/stores/")) throw new Error("missing /stores/ entries");
  if (!body.includes("/cards")) throw new Error("missing /cards entry");
  if (!isLocal && body.includes("localhost")) {
    throw new Error("sitemap leaks localhost — check NEXT_PUBLIC_SITE_URL");
  }
}

async function expectOpengraphImage(): Promise<void> {
  const res = await fetchWithRetry("/opengraph-image");
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`expected image/* content-type, got "${contentType}"`);
  }
}

// ── §9 security headers ──────────────────────────────────────────────────────

// Copied verbatim from next.config.ts — do not diverge.
const EXPECTED_HEADERS: [string, string][] = [
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["permissions-policy", "camera=(), microphone=(), geolocation=()"],
];

async function expectSecurityHeaders(): Promise<void> {
  const res = await fetchWithRetry("/");
  const mismatches: string[] = [];
  for (const [name, expected] of EXPECTED_HEADERS) {
    const actual = res.headers.get(name);
    if (actual !== expected) {
      mismatches.push(`${name}: expected "${expected}", got "${actual ?? "(missing)"}"`);
    }
  }
  const csp = res.headers.get("content-security-policy-report-only") ?? "";
  if (!csp.includes("'strict-dynamic'") || !/'nonce-[^']+'/.test(csp)) {
    mismatches.push("content-security-policy-report-only: missing nonce/strict-dynamic");
  }
  if (csp.includes("'unsafe-inline'")) {
    mismatches.push("content-security-policy-report-only: unsafe-inline present");
  }
  if (mismatches.length > 0) throw new Error(mismatches.join("; "));
}

// HSTS is injected by Vercel's edge, not next.config.ts, and is legitimately
// absent locally by design — a warn, never a fail (checklist §9).
async function expectHsts(): Promise<void> {
  const res = await fetchWithRetry("/");
  const hsts = res.headers.get("strict-transport-security");
  if (!hsts) {
    throw new CheckWarning(
      "Strict-Transport-Security header absent — expected on Vercel edge in production"
    );
  }
}

// ── --strict-content: public trust-marker checks (opt-in) ───────────────────
//
// Catches the product-trust regressions route/SEO/header checks above don't:
// placeholder/demo copy, static-demo-data leakage, and unready card offers
// reaching a public page. Every marker is high-precision and literal — never
// a bare word like "sample" or "expired" that occurs in legitimate copy —
// see lib/content/placeholderCopy.ts's own precision note (tested for
// alignment in tests/admin/placeholderCopy.test.ts).
//
//   - "Illustrative sign-up bonus" / "Illustrative statement credit" /
//     "Sample only"  — the literal static-demo card-offer copy
//     (lib/offers/manualOffers.ts). Only ever served publicly as the
//     no-Supabase/DATA_SOURCE=static demo pool for /cards, or as a card_offers
//     row that failed the public-readiness gate (lib/offers/cardReadiness.ts —
//     placeholder wording is itself one of its failure reasons). Seeing any of
//     these against a configured production base URL means either static
//     demo data leaked live, or an unready card offer reached the public pool.
//   - "placeholder URL" / "lorem ipsum" — generic placeholder-copy markers.
//   - "Application error" — an unhandled-error shell (already checked per
//     PUBLIC_ROUTES above; repeated here for the strict route set).
//   - "Expired / unknown" — the exact ConfidenceBadge label
//     (components/ConfidenceBadge.tsx) shown only for a real expired-unknown
//     result. Search/store source results are supposed to filter these out
//     before render (lib/repos/sourceResults.ts) — this marker catches a
//     regression in that filter.
export const STRICT_CONTENT_BANNED_MARKERS: string[] = [
  "Illustrative sign-up bonus",
  "Illustrative statement credit",
  "Sample only",
  "placeholder URL",
  "lorem ipsum",
  "Application error",
  "Expired / unknown",
];

// Fixed, hand-picked public routes only — no crawling, no admin routes.
const STRICT_CONTENT_ROUTES = [
  "/",
  "/deals",
  "/cards",
  "/search?q=qantas",
  "/search?q=myer",
  "/stores/myer",
  "/stores/jb-hifi",
];

export async function expectNoPublicTrustMarkers(path: string): Promise<void> {
  const res = await fetchWithRetry(path);
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error(`expected text/html content-type, got "${contentType}"`);
  }
  const body = await res.text();
  const hits = STRICT_CONTENT_BANNED_MARKERS.filter((marker) => body.includes(marker));
  // localhost is only a leak when the base URL itself claims to be production.
  if (!isLocal && body.includes("localhost:3000")) hits.push("localhost:3000");
  if (hits.length > 0) {
    // Never log the body itself — only the route (via the check name) and
    // which markers matched.
    throw new Error(`banned marker(s) found: ${hits.join(", ")}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("DealStack AU — route smoke test");
  console.log(`  base URL:       ${baseUrl}`);
  console.log(`  isLocal:        ${isLocal}`);
  console.log(`  strictContent:  ${strictContent}\n`);

  for (const { path, marker } of PUBLIC_ROUTES) {
    await check(`GET ${path} (200, marker "${marker}")`, () => expectPublicRoute(path, marker));
  }

  await check("GET /this-page-does-not-exist-xyz (404, branded not-found)", async () => {
    const res = await fetchWithRetry("/this-page-does-not-exist-xyz");
    if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
    const body = await res.text();
    if (!body.includes("DealStack")) {
      throw new Error('branded not-found marker "DealStack" missing from body');
    }
  });

  await check("GET /stores/not-a-real-store-xyz (404)", async () => {
    const res = await fetchWithRetry("/stores/not-a-real-store-xyz");
    if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
  });

  for (const path of ADMIN_ROUTES) {
    await check(`GET ${path} redirects to /admin/login (307, unauthenticated)`, () =>
      expectAdminRedirect(path)
    );
  }

  await check("GET /api/cron/monitor-feeds without auth never returns 200", expectCronGateClosed);
  await check(
    "GET /api/health/monitor without auth never returns 200",
    expectMonitorHealthGateClosed
  );
  await check(
    "GET /api/health/data without auth never returns 200",
    expectDataHealthGateClosed
  );

  await check("GET /robots.txt", expectRobotsTxt);
  await check("GET /sitemap.xml", expectSitemapXml);
  await check("GET /opengraph-image", expectOpengraphImage);

  await check("Security headers on / match next.config.ts", expectSecurityHeaders);
  if (baseUrl.startsWith("https://")) {
    await check("Strict-Transport-Security present on / (Vercel edge)", expectHsts);
  }

  if (strictContent) {
    console.log("\n--strict-content: scanning for banned public trust markers\n");
    for (const path of STRICT_CONTENT_ROUTES) {
      await check(`GET ${path} has no banned public trust markers`, () =>
        expectNoPublicTrustMarkers(path)
      );
    }
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail");
  const warned = results.filter((r) => r.status === "warn");

  console.log(`\n${passed} passed, ${failed.length} failed, ${warned.length} warned`);

  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail}`);
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

if (isMainModule) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
