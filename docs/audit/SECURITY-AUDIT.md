# Security Audit

> Audit date: 2026-07-19 · HEAD `9b7365f` · Read-only, code-level. No penetration testing was performed; no production system was touched.

## Verdict

No new confirmed vulnerability was found in this pass. The residual items are hardening tickets that already exist in the backlog (DS-079…DS-085) plus one response-hygiene defect (TASK-REL-001) and open verification items.

## Controls verified in code

| Area | State |
|---|---|
| Cron/webhook auth | All 6 cron + 2 health routes: `timingSafeEqual` bearer check, 503 when secret unset (fail-visible), 401 otherwise. No auth via query string. |
| Secrets | `.env.local` git-ignored (verified). `lib/env.ts` lazy accessors; `supabaseServiceRoleKey()` server-only with explicit warnings; `cronSecret()` never echoed. Workflows log allowlisted keys only. |
| Service-role isolation | Admin repos under `lib/admin/repos/` only; `getSupabaseAdmin()` throws in browser context. Public repos use anon client + RLS. |
| SSRF / outbound fetch | `lib/security/urlPolicy.ts`: exact-host allowlists per source type (ozbargain, gcdb, pointhacks), HTTPS-only, no credentials/ports, control-char rejection; Point Hacks adapter restricted to ONE exact path; OzBargain recheck restricted to exact post-URL shape for HEAD-only probes. No user-controlled outbound requests found. |
| Open redirects | `safePublicHref` blocks `//`, backslashes, traversal, decodes segments; store logos pinned to `/logos/` regex. |
| XSS | Single `dangerouslySetInnerHTML` (`components/JsonLd.tsx`) with serialised JSON-LD (`serializeJsonLd`). React escaping elsewhere; feed HTML is never rendered (RSS/Atom parse only, no HTML scraping except the one allowlisted Point Hacks page which goes through a parser, not the DOM). |
| SQLi | Supabase client query-builder + RPCs; no string-built SQL found in app code. |
| Headers | `next.config.ts`: nosniff, DENY, Referrer-Policy, Permissions-Policy on every route. CSP: nonce-based, strict-dynamic, `frame-ancestors 'none'` — but **Report-Only** (see below). |
| Admin auth | Optimistic proxy + data-layer `requireAdmin()` allowlist (defence in depth documented in `proxy.ts`). |
| Rate limiting | Admin mutations: Postgres advisory-lock RPC (fail-open, documented). Public POST surfaces (`/api/reports/*`, correction reports) have their own limits (migration 026/032 work; DS-032 hardening ticket exists). |
| Observability | `lib/observability/sanitize.ts` scrubs before reporting; cron routes return fixed error strings — except monitor-feeds (finding below). |

## Findings

### SEC-F1 — monitor-feeds echoes internal error detail *(Confirmed, low severity → TASK-REL-001)*
`app/api/cron/monitor-feeds/route.ts` returns `errMessage(error)` and `complianceError` verbatim to the (authenticated) caller, and the manual GH workflow prints selected keys to public logs. Every sibling route returns a fixed string. Align to the fixed-string convention.

### SEC-F2 — CSP remains Report-Only *(Known, ticketed DS-082)*
`proxy.ts` sends `Content-Security-Policy-Report-Only`. Enforcement is the ticketed next step after violation review; no new task.

### SEC-F3 — Hardening probes not yet automated *(Ticketed)*
Anon-RLS assertion probe (DS-079), SECURITY DEFINER/search_path audit probe (DS-080 — note migration 008/013 already pin search_path and revoke trigger EXECUTE), log-redaction review (DS-081), dependency-vulnerability CI gate (DS-083), secret rotation runbook (DS-084), unified timing-safe bearer helper (DS-085 — the helper is currently copy-pasted 8×, drift risk visible in `health/monitor`'s slightly different variant). Cross-referenced from tasks; not duplicated.

### SEC-F4 — Production-side verifications this session could not perform
- RLS behaviour against live anon key (needs read-only probe — DS-079 automates it).
- Whether Vercel env separates preview/production secrets correctly (operator check; `docs/runbooks/PRODUCTION-HEALTH-CHECK.md`).
- Supabase advisors output (`get_advisors`) — safe to run later via MCP, not run in this session.

## Threat notes for implementers

- **Source poisoning** is the realistic attack surface: a compromised/allowlisted feed feeding hostile XML/HTML. Mitigations in place: fast-xml-parser with size/content-type limits (DS-042 test-enforcement ticket), staged-only writes, human approval gate, `sanitisePublicText`, DS-047 hostile-fixture ticket. Keep every new source behind `urlPolicy` + staging.
- **Never weaken:** the approval boundary, the default-off env gates, or the service-role/anon split. Any task touching these must say so explicitly (all task files in `tasks/` carry a Production safety section).
