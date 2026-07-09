# PLAN: `npm run smoke` — automate the launch checklist's route/SEO/header QA

> **Rank: 3 of 5.** FINAL-LAUNCH-CHECKLIST.md §7 (public route QA), §8
> (robots/sitemap/OG/JSON-LD hosts) and §9 (security headers) are today a
> manual click-through that has to be repeated after every phase — and this
> project ships several phases a week. This plan turns those sections into a
> single read-only script that fetches the running site (local dev, local
> prod build, or the live deployment) and prints PASS/FAIL per check. It uses
> plain `fetch` — no browser, no new dependencies — so it stays trivially
> maintainable. It also encodes two fail-closed security assertions that a
> manual pass can quietly skip: unauthenticated `/admin/*` must redirect, and
> the cron route must never return 200 without auth.

## Prerequisites

- `nvm use 20` (global `fetch` needs Node ≥18; repo pins ≥20).
- Read before coding:
  - `FINAL-LAUNCH-CHECKLIST.md` §§7–9 — the checks being automated; keep the
    script's check names traceable to those bullets.
  - `next.config.ts` — the four security headers asserted (copy the exact
    key/value pairs; do not invent values).
  - `app/api/cron/monitor-feeds/route.ts` — gate behaviour: no `CRON_SECRET`
    env → 503; wrong/missing `Authorization` → 401. The smoke check accepts
    either, and fails only on 200.
  - `scripts/cleanup-old-deals.ts` — CLI conventions to mirror (arg parsing,
    `--help`, exit codes). Note this script does NOT need `.env.local` or any
    Supabase key — it only talks HTTP to the app.

## Goal

`npm run smoke` (defaults to `http://localhost:3000`) or
`npm run smoke -- --base-url=https://<prod-domain>` runs every check below
against a **running** server and exits 0 only if all pass. It is read-only:
GET requests to our own app, nothing else, no external hosts, no writes.

## Exact files to touch

| File | Change |
|---|---|
| `scripts/smoke-routes.ts` | **New** — the whole script, data-driven check table |
| `package.json` | Add `"smoke": "tsx scripts/smoke-routes.ts"` |
| `FINAL-LAUNCH-CHECKLIST.md` | §§7–9: note each automated bullet is covered by `npm run smoke` |

No app code changes. No new dependencies. No test-suite changes.

## Step-by-step implementation order

### Step 1 — script skeleton

- Parse `--base-url=` (default `http://localhost:3000`), strip any trailing
  slash. Support `--help`.
- Derive `isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(baseUrl)` —
  several checks are conditional on it.
- Helper `check(name: string, fn: () => Promise<void>)` that catches, records
  pass/fail + failure detail, and prints `✓ name` / `✗ name — detail`.
- Every fetch: `redirect: "manual"`, a 15-second `AbortSignal.timeout`, and
  **one retry** on network error or timeout (first hit on a cold dev server
  compiles the route and can exceed the timeout; a genuine failure fails
  twice). Send header `user-agent: dealstack-smoke/1.0` so the requests are
  identifiable in logs.

### Step 2 — public routes (checklist §7)

Data-driven table — one entry per route so future routes are one-line adds:

```ts
const PUBLIC_ROUTES = [
  { path: "/", marker: "DealStack" },
  { path: "/deals", marker: "DealStack" },
  { path: "/search?q=myer", marker: "Myer" },
  { path: "/cards", marker: "DealStack" },
  { path: "/resources", marker: "DealStack" },
  { path: "/stores/myer", marker: "Myer" },
  { path: "/stores/jb-hifi", marker: "JB" },
  { path: "/stores/woolworths", marker: "Woolworths" },
];
```

For each: status 200; `content-type` includes `text/html`; body includes the
marker; body does NOT include `"Application error"` (Next's unhandled-error
shell). Markers are deliberately generic — store names and the site name —
so routine copy edits don't break the suite (see edge case 3).

Also:
- `/this-page-does-not-exist-xyz` → status **404** AND body contains
  `DealStack` (proves the branded not-found page renders, not a bare 404).
- `/stores/not-a-real-store-xyz` → 404 (dynamic-route notFound() path).

### Step 3 — auth boundaries (checklist §7 last bullet + §4 gate)

- `/admin/dashboard`, `/admin/card-offers`, `/admin/signals/queue`: with
  `redirect: "manual"`, expect **307** and a `location` header containing
  `/admin/login`. Anything 2xx is a hard fail (data leak).
- `/api/cron/monitor-feeds` with **no** Authorization header: expect status
  ∈ {401, 503} — fail on anything else, and fail loudly on 200 ("cron gate
  is open without auth").

### Step 4 — SEO endpoints (checklist §8)

- `/robots.txt`: 200; contains `Disallow: /admin`; contains a `Sitemap:` line.
  When `!isLocal`, that line must contain the base-url host and must not
  contain `localhost`.
- `/sitemap.xml`: 200; contains `<loc>`; contains `/stores/`; contains
  `/cards`; when `!isLocal`, no `localhost` anywhere in the body (this is the
  `NEXT_PUBLIC_SITE_URL` misconfiguration detector — checklist §8 calls it
  the root cause that breaks every other SEO item).
- `/opengraph-image`: 200 and `content-type` starting `image/`.

### Step 5 — security headers (checklist §9)

On the `/` response assert exact values from `next.config.ts`:
`x-content-type-options: nosniff`, `x-frame-options: DENY`,
`referrer-policy: strict-origin-when-cross-origin`,
`permissions-policy: camera=(), microphone=(), geolocation=()`.
HSTS: only when the base-url is `https://`, check `strict-transport-security`
is present — as a **WARN, not FAIL** (Vercel injects it at the edge; checklist
§9 documents it is absent locally by design). Print warns distinctly.

### Step 6 — summary + exit

Print `N passed, M failed, K warned`, list failures with details, exit 1 if
any failure, else 0.

### Step 7 — wire up + docs + verify

- `package.json`: add the `smoke` script.
- FINAL-LAUNCH-CHECKLIST.md: annotate §§7–9 bullets covered by the script
  ("automated: `npm run smoke`"); leave the genuinely manual ones (mobile
  overflow, visual layout, content correctness) untouched.
- Verify locally:

```bash
nvm use 20
npm run lint && npm run build
npm run start &            # prod-mode server on :3000 (or use the dev server)
npm run smoke              # expect: all pass, exit 0
npm run smoke -- --base-url=https://<prod-domain>   # if deployed: also green
```

## Edge cases a weaker model would miss

1. **`redirect: "manual"` is load-bearing.** Default fetch follows the 307 to
   `/admin/login`, sees 200, and the "admin is protected" check passes even
   if the redirect vanished entirely. Assert on the 307 + location header,
   never on the followed response.
2. **The cron-gate check must accept two codes.** Locally without
   `CRON_SECRET` the route returns 503; deployed with the secret set but no
   auth header it returns 401. Pinning either single code makes the check
   red in the other environment. The invariant worth testing is "never 200
   unauthenticated".
3. **Don't assert on marketing copy.** Headlines and section titles on this
   site change most weeks ("This week's picks" shipped days ago). Markers
   must be things that survive copy churn: store names, the brand name, HTTP
   semantics. If a future check needs page-specific proof, prefer structural
   strings (e.g. `og:` meta, `application/ld+json`) over prose.
4. **First hit on a dev server compiles the route** and can take >15s on this
   machine (memory: Turbopack needs the Node-20 PATH prefix, and a panicked
   run poisons `.next/dev`). The one-retry rule exists for this; don't lower
   the timeout, and prefer running against `npm run start` (prod build) for
   deterministic timing.
5. **`/stores` (no slug) currently 404s by design** — checklist §7 documents
   it. Do NOT add it to `PUBLIC_ROUTES` as a 200 expectation. If
   PLAN-stores-index.md ships first, it becomes a one-line addition — the
   data-driven table is shaped for exactly that.
6. **The sitemap-localhost check must be conditional.** Run locally,
   `NEXT_PUBLIC_SITE_URL` is legitimately unset and every `<loc>` says
   localhost; only a deployed run may treat that as failure. That's what
   `isLocal` is for — losing that conditional makes the script permanently
   red locally or permanently blind in prod.
7. **HSTS is a warn, not a fail** — it is injected by Vercel's edge, so its
   absence on a self-hosted/preview run is expected. Failing on it would
   train people to ignore red output, which kills a smoke suite.
8. **Header value comparisons should be case-insensitive on the header NAME**
   (fetch normalises to lowercase — use `response.headers.get(...)`) but
   exact on the VALUE, matching `next.config.ts` verbatim.
9. **No Supabase env needed — don't import `lib/env.ts` Supabase accessors.**
   The script must run against prod from a machine with no `.env.local` at
   all. Its only input is the base URL.
10. **This is not scraping.** The no-scraping rule (CLAUDE.md) is about
    external sites; GETting our own deployment for QA is the same category as
    the external cron scheduler hitting our route. Do not point the script at
    any non-DealStack host, and don't fetch any URL found *in* the responses
    (no crawling — fixed route list only).

## Acceptance criteria

- [ ] Against a local `npm run start` build: all checks pass (HSTS warn
      allowed), exit code 0, output lists every check name with ✓.
- [ ] With the server stopped: script fails fast with clear network-error
      messages and exit 1 (does not hang past ~30s total).
- [ ] `curl -I` proof-points match script results for at least: `/` headers,
      `/admin/dashboard` 307 + location, `/api/cron/monitor-feeds` non-200.
- [ ] Deliberately breaking a check locally is detected: e.g. temporarily
      change a marker to `"ZZZ-not-on-page"` → that check fails, exit 1.
- [ ] Run against the live deployment (if reachable): passes, including
      sitemap/robots host checks with no `localhost` leakage, and HSTS
      present (no warn).
- [ ] `git diff --stat` touches only `scripts/smoke-routes.ts`,
      `package.json`, `FINAL-LAUNCH-CHECKLIST.md`.
- [ ] `npm run lint` and `npm run build` pass on Node 20. No new
      dependencies in `package.json`.
