> **STATUS (2026-07-10): SHIPPED in `07d8049`, `831b99e` — do not re-execute.**
> Kept for reference. Verify with `git log --oneline | grep -E "07d8049|831b99e"`.

# PLAN: Public hardening — security headers, error/404 boundaries, date-logic fixes

> **Rank: 8 of 10.** Three small, independent, permanent wins bundled into one
> reviewable pass (each is its own commit):
> 1. `next.config.ts` is literally empty — the site ships with **no security
>    headers** (no `X-Frame-Options`/`frame-ancestors`, no `nosniff`, no
>    `Referrer-Policy`, no `Permissions-Policy`). The admin portal being
>    frameable is the concrete risk.
> 2. There is **not a single `error.tsx`, `not-found.tsx`, or
>    `global-error.tsx` in the whole app** (verified by `find`). The store
>    page calls `notFound()` for unknown slugs, so visitors get Next's
>    unstyled default 404; any thrown repo error yields the default error
>    screen. Both are off-brand dead ends on a public site.
> 3. `isExpiringSoon` is copy-pasted **identically** in
>    `components/DealsClient.tsx:99` and `components/CardsClient.tsx:32`,
>    both hardcoding `T23:59:59+10:00` — AEST forever, wrong by an hour
>    during AEDT (roughly October–April, i.e. most of the year including
>    now). Plan 2 created `lib/offers/expiry.ts` for exactly this kind of
>    shared date logic; extend it and delete the duplicates.

## Prerequisites

- Plans 1–5 complete — **this plan builds directly on plan 2's
  `lib/offers/expiry.ts`** (`todayAU`, `isPastExpiry`, `filterLive`). If that
  module does not exist, stop and do plan 2 first.
- `nvm use 20`; read `AGENTS.md`. Before Part 2, read the Next.js 16 docs for
  `error.tsx` / `not-found.tsx` conventions in
  `node_modules/next/dist/docs/` — do not trust training-data conventions
  (this repo already renamed middleware to `proxy.ts`, so file conventions
  demonstrably differ).
- Hard constraints: do NOT touch `app/layout.tsx` or `app/globals.css`. The
  new `error.tsx` / `not-found.tsx` are separate files and are allowed; a
  `global-error.tsx` is explicitly OUT of scope (it replaces the root layout
  when rendering, and getting its styling right without touching globals is
  not worth it here).

## Goal

Security headers on every response; branded, helpful 404 and error pages for
the public site; one shared, AU-timezone-correct "expiring soon" helper with
tests; `formatExpiry` (if it exists as flagged by the 2026-06-25 review)
guarded against bad input.

## Exact files to touch

| File | Change |
|---|---|
| `next.config.ts` | `headers()` with a conservative security set |
| `app/not-found.tsx` | **New** — branded 404 |
| `app/error.tsx` | **New** — branded error boundary (client component) |
| `lib/offers/expiry.ts` | Add `isExpiringSoonAU()` (shared, DST-correct) |
| `components/DealsClient.tsx`, `components/CardsClient.tsx` | Delete local duplicates, import shared helper |
| `lib/sources/normalise.ts` (or wherever `formatExpiry` lives) | Input-shape guard returning a safe fallback |
| `tests/stack/expiryGuard.test.ts` | Extend with `isExpiringSoonAU` cases |

## Step-by-step implementation order

### Part 1 — security headers (commit 1)

In `next.config.ts`:

```ts
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
```

Explicit non-goals, with reasons you must not "improve" past:
- **No full `Content-Security-Policy`.** Next injects inline scripts/styles;
  a strict CSP needs nonce plumbing through the root layout — which is
  off-limits. `X-Frame-Options: DENY` already covers the framing risk.
- **No `Strict-Transport-Security`.** Vercel manages HTTPS/HSTS at the
  platform level for its domains; setting long-max-age HSTS from app config
  is a footgun if a custom domain is added later. Leave it to the platform.
- Nothing route-conditional — one set, every route, including `/admin`.

Verify: `npm run dev`, then `curl -sI http://localhost:3000/ | grep -i
"x-frame\|nosniff\|referrer\|permissions"` shows all four (also spot-check
`/admin/login`).

### Part 2 — 404 and error boundaries (commit 2)

1. Read the Next 16 docs for the exact contracts (`not-found` file, `error`
   file must be `"use client"` and receives `{ error, reset }`).
2. `app/not-found.tsx` (server component is fine): match the public pages'
   look using existing primitives (`Card`, `Button` from `components/ui/`,
   Tailwind classes copied from an existing public page — NOT new global
   styles). Copy (Australian English): heading "Page not found", a line like
   "This page doesn't exist or the store may have been unpublished.", and
   links to `/` , `/deals`, `/search`.
3. `app/error.tsx` (`"use client"`): apologetic one-liner, a "Try again"
   button wired to `reset()`, and a link home. Do not render `error.message`
   to visitors (may leak internals); `console.error(error)` in a
   `useEffect` is enough.
4. Because these live at the app root, they cover every public route AND the
   admin segment; that is fine (admin errors get the branded page too).

Verify: request `/stores/definitely-not-a-store` → branded 404 (the store
page already calls `notFound()`); temporarily `throw new Error("test")` at
the top of `app/deals/page.tsx`, confirm the branded error page + working
"Try again", then **revert the throw**.

### Part 3 — shared `isExpiringSoonAU` + `formatExpiry` guard (commit 3)

1. In `lib/offers/expiry.ts`, add alongside plan 2's helpers:
   ```ts
   /** Days ahead treated as "expiring soon" on public deal cards. */
   export const EXPIRY_SOON_DAYS = /* copy the constant the components use — read EXPIRY_SOON_MS in DealsClient/CardsClient and convert */;

   /**
    * True when expiry falls within EXPIRY_SOON_DAYS from today (inclusive),
    * and is not already past. Computed on AU-local CALENDAR DATES via
    * todayAU() — no fixed +10:00 offset, so AEDT is handled correctly.
    */
   export function isExpiringSoonAU(
     expiryDate: string | null | undefined,
     now: Date = new Date(),
     soonDays: number = EXPIRY_SOON_DAYS
   ): boolean {
     if (expiryDate == null) return false;
     const today = todayAU(now);
     if (expiryDate < today) return false;            // already past
     const soonCutoff = addDaysToIsoDate(today, soonDays); // implement: parse Y-M-D, add days via Date.UTC arithmetic, reformat
     return expiryDate <= soonCutoff;
   }
   ```
   Implement `addDaysToIsoDate` as a tiny pure helper using `Date.UTC` on
   the Y-M-D parts (UTC arithmetic on a date-only value cannot DST-shift).
   First read both components to capture the current threshold and the
   `diff >= 0` inclusivity, and preserve that observable behaviour (the only
   intended behaviour change is the AEDT hour error).
2. In `components/DealsClient.tsx` and `components/CardsClient.tsx`: delete
   the local `isExpiringSoon` and `EXPIRY_SOON_MS`, import
   `isExpiringSoonAU` from `@/lib/offers/expiry`, and replace call sites
   (`isExpiringSoon(o.expiryDate)` → `isExpiringSoonAU(o.expiryDate)`).
   These are client components importing a pure module — no server-only
   imports may ride along (check `lib/offers/expiry.ts` imports nothing
   server-only; after plan 2 it should be dependency-free).
3. `formatExpiry`: locate it (`grep -rn "formatExpiry" lib components app`).
   The 2026-06-25 review flagged it as not validating input shape. If it
   exists, guard it the way `formatDateAU` (`lib/sources/normalise.ts:91`)
   already does — malformed input returns a safe fallback (`null` or `"—"`
   matching its call sites) instead of `"undefined NaN"`-style output. If
   grep shows it no longer exists or is already guarded, skip and say so.
4. Extend `tests/stack/expiryGuard.test.ts`: null → false; yesterday →
   false; today → true; today+soonDays → true; today+soonDays+1 → false;
   month/year boundary (e.g. 29 Dec + 7 days); DST regression pin — a `now`
   during AEDT (e.g. `2026-01-15T13:30:00Z`) with expiry equal to that
   AU-local date must return true.

### Final verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:stack && npm run test:monitor && npm run test:admin
```

`grep -rn "23:59:59+10:00" components lib` must return nothing.

## Edge cases a weaker model would miss

1. **The `+10:00` bug is subtle and currently live-wrong.** In AEDT
   (UTC+11), `2026-01-20T23:59:59+10:00` is 00:59 on 21 Jan in Sydney — an
   offer shows "expiring" state an hour late and, on the boundary day,
   inconsistently with plan 2's `todayAU` read-guard semantics. Date-only
   string comparison against `todayAU()` sidesteps offsets entirely; do NOT
   replace `+10:00` with `+11:00` or `Intl` hour math.
2. **Two different "soon" concepts exist — unify only one.**
   `lib/stack/compatibility.ts` has its own `EXPIRY_SOON_DAYS` and
   `expirySoonWarning` for stack warnings (different threshold, different
   copy, server-side). Leave it alone; this plan unifies only the two
   identical component helpers.
3. **`error.tsx` must be a client component** and must not import server-only
   modules (repos, `lib/supabase/*`). A copy-paste from a public page that
   drags in a server import will fail the build in a confusing way.
4. **Don't echo `error.message` into the error page.** Repo errors embed
   table names and Supabase messages (`listStores failed: …`) — internal
   detail on a public screen.
5. **`X-Frame-Options: DENY` sitewide is intentional** — nothing on this
   site is meant to be embedded; the admin absolutely must not be. If a
   future need to embed arises, that's a deliberate future change.
6. **Headers via `next.config.ts` don't apply to `next dev`'s HMR websocket
   or static asset edge cases identically to prod** — verify presence with
   curl locally, but treat Vercel preview as the real confirmation
   (`curl -sI https://<deployment>/`).
7. **Keep the three parts as three commits.** They're independent; a revert
   of one must not drag the others (project rule: small reviewable changes).
8. **Behaviour parity first:** capture the components' current
   `EXPIRY_SOON_MS` (convert ms → days) rather than inventing a threshold;
   if the two components ever diverged in the constant, preserve each
   call-site's threshold via the `soonDays` parameter and note it.

## Acceptance criteria

- [ ] `curl -sI` on `/`, `/deals`, `/admin/login` shows all four security
      headers; no CSP or HSTS header was added.
- [ ] `/stores/not-a-real-slug` renders the branded 404 with working links;
      an artificially thrown page error renders the branded error page and
      "Try again" recovers after the throw is reverted; neither page shows
      raw error text.
- [ ] `app/layout.tsx` and `app/globals.css` are untouched
      (`git diff --stat` proves it); no `global-error.tsx` was added.
- [ ] `grep -rn "isExpiringSoon" components/` shows only imports from
      `@/lib/offers/expiry`; `grep -rn "23:59:59+10:00" .` (excluding
      node_modules/docs) is empty; deals/cards "expiring soon" badges render
      as before.
- [ ] New expiry tests pass, including the AEDT pin and the
      `soonDays` boundary; all three suites + lint + build green on Node 20.
- [ ] Three separate commits, each passing the commit checklist on its own.
