# DealStack AU — App Store Plan: Overview

**Goal:** Ship DealStack AU to the Apple App Store as an iOS app.

**Read this file completely before starting any phase. Execute phases strictly in
order. One phase = one working session = one commit (or small commit series).
Never start a phase before the previous phase's "Done when" checklist is fully
green.**

## Chosen architecture (decided — do not re-litigate)

A **Capacitor iOS shell that loads the deployed production website**, plus a
small set of native features (offline saved deals, native share, haptics, app
quick-actions) that make it more than a website wrapper.

Why this and not the alternatives:

- **React Native / Expo rebuild** — rejected: months of UI rework, duplicated
  logic, two codebases to keep in sync. Out of scope.
- **Static export bundled into the app** — rejected: the site uses React Server
  Components reading Supabase server-side; it cannot be statically exported
  without a major refactor.
- **Capacitor remote-URL shell** — chosen: near-zero duplication, the web team
  ships once, the app updates instantly. The risk is Apple Guideline 4.2
  (minimum functionality); Phases 2 and 4 exist specifically to defeat that
  risk, and Phase 7 is the contingency if a rejection happens anyway.

## Phase map

| Phase | File | What it delivers | Who |
|---|---|---|---|
| 1 | `01-PREREQUISITES-HUMAN.md` | Apple Developer account, Xcode, App Store Connect record | **Human only** |
| 2 | `02-MOBILE-WEB-READINESS.md` | Website behaves like an app inside a native shell | Model |
| 3 | `03-CAPACITOR-IOS-SHELL.md` | Runnable iOS app in the Simulator | Model |
| 4 | `04-NATIVE-FEATURES.md` | Guideline-4.2 defence: offline saves, share, haptics, quick actions | Model |
| 5 | `05-APP-STORE-ASSETS-METADATA.md` | Icon, splash, screenshots, listing copy, privacy labels | Model + human |
| 6 | `06-TESTFLIGHT-SUBMISSION.md` | Archive, TestFlight beta, submission | Model + human |
| 7 | `07-REVIEW-CONTINGENCY.md` | Playbook for rejections | Model + human |

## Hard rules for the executing model

These override anything you might otherwise decide. They repeat and extend the
repo's `CLAUDE.md` — read that too.

1. **Do not touch `app/layout.tsx` or `app/globals.css`** without pausing and
   asking the user first. If a step in these plans requires it, the step says so
   explicitly and tells you to get sign-off.
2. **Do not redesign any existing page.** Mobile-readiness changes are additive
   (CSS classes, small conditionals), never restructuring.
3. **The admin portal must never be reachable from inside the app shell.**
   Phase 2 enforces this; every later phase must keep it true.
4. **No secrets in the mobile project.** The shell loads the public site; it
   needs no Supabase keys at all. If you find yourself copying an env var into
   `mobile/`, stop — you are doing something wrong.
5. **Never run `npx cap` / `pod install` / Xcode builds from inside the Next.js
   workspace root.** All mobile tooling runs inside `mobile/`.
6. **Verification is not optional.** Every phase ends with a "Done when"
   checklist. Run every item. If one fails, fix it before committing.
7. **Commit ritual** (web-repo changes): `npm run lint`, `npm run typecheck`,
   `npm run build` must pass (Node 20 — run `nvm use 20` first; the shell
   defaults to Node 15). Run the targeted test suite for anything you touched.
   Docs-only and `mobile/`-only commits still require lint/typecheck/build to
   pass, because CI runs them on every push.
8. **When a step needs information only the user has** (Apple ID, production
   domain, team ID), stop and ask. Placeholders in these docs look like
   `<PRODUCTION-DOMAIN>` — never guess them, never commit a guess.
9. **Keep changes small and reviewable.** If a phase's diff exceeds roughly 500
   lines, split it into sequential commits with passing checks at each.

## Placeholders used across all phase files

Ask the user for these once, at the start of Phase 2, and write the answers into
`docs/appstore/CONFIG.md` (create it; it is referenced by later phases):

- `<PRODUCTION-DOMAIN>` — the deployed public site, e.g. `dealstack-au.vercel.app`
  or a custom domain. Must be HTTPS and publicly reachable.
- `<BUNDLE-ID>` — reverse-DNS app id. Suggest `au.com.dealstack.app`; the user
  confirms or supplies their own.
- `<APPLE-TEAM-ID>` — from the user's Apple Developer account (Phase 1).
- `<APP-NAME>` — App Store display name. Suggest "DealStack AU".

## Current-state facts the plans rely on (verified 2026-07-25)

- Next.js 16 App Router, React 19, TypeScript, Tailwind v4; deployed on Vercel
  Hobby; Supabase Postgres backend.
- Public routes: `/`, `/deals`, `/stores`, `/gift-cards`, `/cashback`, `/cards`,
  `/rewards`, `/search`, `/resources`, `/privacy`, `/terms`, `/editorial-policy`.
- **The public site has no user accounts.** Only `/admin` has auth (Supabase,
  admin-only). This means: no "Sign in with Apple" requirement, no
  account-deletion requirement — provided the app shell blocks `/admin`.
- Playwright e2e suite exists (`npm run test:e2e`); build/e2e run with
  `DATA_SOURCE=static`.
- `docs/` is the documentation home; this plan lives in `docs/appstore/`.
