# Phase 2 — Mobile web readiness (web repo changes)

**Goal:** the existing website, when loaded inside a native WebView, looks and
behaves like an app screen — correct safe areas, no desktop chrome, no admin
access — without redesigning anything.

**All work in this phase is in the Next.js repo (not `mobile/`, which doesn't
exist yet). Standard commit checklist applies (lint, typecheck, build, e2e for
touched routes).**

## Step 0 — Collect config
Ask the user for the values listed in `00-OVERVIEW.md` → "Placeholders". Write
`docs/appstore/CONFIG.md` with them. Do not proceed on guesses.

## Step 1 — App-shell detection

The native shell (Phase 3) will load the site with a query param `?app=1` and a
custom user-agent suffix `DealStackApp/1.0`. The site needs to know it's inside
the app so it can adapt.

1. Create `lib/app-shell.ts`:
   - `isAppShellRequest(headers: Headers): boolean` — true when the `user-agent`
     header contains `DealStackApp/`.
   - Export a cookie name constant `APP_SHELL_COOKIE = 'ds_app_shell'`.
2. Create `middleware.ts` logic (or extend the existing middleware if one
   exists — **check first**: `ls middleware.ts src/middleware.ts`):
   - If the user-agent contains `DealStackApp/` and the `ds_app_shell` cookie is
     absent, set it (`value '1'`, `httpOnly: false`, `sameSite: 'lax'`, 1-year
     max-age). This makes shell detection sticky across client navigations.
   - **In the same middleware: if the request is for `/admin` or any subpath and
     the user-agent contains `DealStackApp/`, rewrite to the 404 page.** The
     admin portal must be unreachable in the app (Overview hard rule 3).
3. Create a tiny server helper `getIsAppShell()` (reads `headers()` /
   `cookies()` from `next/headers`) for use in server components, and a client
   hook `useIsAppShell()` (reads the cookie via `document.cookie`) for client
   components.

## Step 2 — Chrome adjustments when in app shell

Additive conditionals only — do not restructure components:

1. **Footer:** hide marketing footer links that duplicate native affordances
   (nothing else). At minimum, keep `/privacy` and `/terms` reachable — App
   Review checks for them.
2. **Header:** keep the site header (it is the app's navigation), but hide any
   "deployment/GitHub/external" links if present.
3. **External links:** all links to third-party sites (retailers, OzBargain,
   cashback portals) must carry `target="_blank"` + `rel="noopener noreferrer"`
   already — verify with a grep of the deal/offer card components; fix any that
   don't. The shell (Phase 3) converts `target="_blank"` into
   "open in system browser".

## Step 3 — Safe areas and viewport

The shell renders edge-to-edge under the iPhone notch/home indicator.

1. **This step touches `app/layout.tsx` — STOP and get the user's explicit
   sign-off first (Overview hard rule 1). The diff is two small additions:**
   - In the `viewport` export (or add one if absent): `viewportFit: 'cover'`,
     `themeColor` matching the site's emerald header.
   - Nothing else in the file changes.
2. Safe-area padding via Tailwind arbitrary values in the header/footer
   components (not globals.css):
   `pt-[env(safe-area-inset-top)]` on the sticky header wrapper,
   `pb-[env(safe-area-inset-bottom)]` on the footer/bottom-most container —
   guarded so they only apply in the app shell (e.g. a `data-app-shell`
   attribute on `<body>` is NOT possible without touching layout.tsx; instead
   apply the classes unconditionally — `env()` is `0px` in normal browsers, so
   this is a no-op on the web).
3. Tap targets: spot-check the main nav and filter controls on a 375px viewport
   (`npm run test:e2e` has mobile viewports; visually verify with the browser
   preview at 375×812). Fix any control smaller than ~44px tall that a user
   must tap. Do not restyle anything that already works.

## Step 4 — PWA manifest (cheap, helps both web and review)

1. Add `app/manifest.ts` (Next.js metadata route) with name, short_name
   "DealStack", `display: 'standalone'`, theme/background colours from the
   existing palette, and icon entries pointing at files added in Phase 5 (use
   the existing favicon for now).

## Step 5 — Verify

- `nvm use 20`, then `npm run lint`, `npm run typecheck`, `npm run build` — all
  pass.
- `DATA_SOURCE=static npm run test:e2e` — existing suite still green.
- Add one Playwright test `tests/e2e/app-shell.spec.ts` (mirror the existing
  e2e file layout — check how current specs are organised first):
  - With user-agent containing `DealStackApp/1.0`: `/` responds 200 and sets
    the `ds_app_shell` cookie; `/admin` responds 404.
  - Without it: `/admin` still behaves as before (login page), cookie not set.
- Manual: browser preview at 375×812, confirm no horizontal scroll on `/`,
  `/deals`, `/gift-cards`, `/search`.

## Done when
- [ ] CONFIG.md exists and is filled in.
- [ ] Shell detection works via user-agent + sticky cookie.
- [ ] `/admin` is 404 for app-shell requests (e2e-pinned).
- [ ] Safe-area classes in place; layout.tsx change signed off by user.
- [ ] Manifest route exists.
- [ ] Full commit checklist green; changes deployed to production (push to
      `main`; Vercel auto-deploys) — Phase 3 loads the LIVE site, so this phase
      must be deployed before Phase 3 verification.
