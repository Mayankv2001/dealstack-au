# PROJECT_STATE.md

> Single source of truth for DealStack AU. Maintained so a second Claude account can continue the work safely without losing context.
>
> **Last updated:** 2026-07-09 · **Branch:** `main` · **Working tree:** clean · **HEAD:** `54fe741`

---

## 1. Project Goal

DealStack AU is a **deal-stacking research tool for Australian shoppers**. It combines cashback portals, gift cards, points/rewards programmes, bank & credit-card offers, and OzBargain feed signals into a single interface that shows how to "stack" discounts on a purchase.

- Deployed on **Vercel (Hobby plan)** with a **Supabase Postgres** backend.
- All external feed data is **staged and admin-reviewed before public publication** — nothing auto-publishes.

## 2. Current Status

- **Live/working:** Public site (homepage, `/deals`, `/stores`, `/search`, `/cards`, `/resources`), admin portal, feed monitor, stacking calculator. Card offers are live (5/5 published by admin).
- **In progress / partial:** Offer-change detection is wired but **behind a default-off flag (staging-only)** — not live in production.
- **Backlog:** 10 execution-ready `PLAN-*.md` files in repo root; most executed, 2–3 remain (see §6).
- **Build/lint/tests:** Expected to pass, **except** one known stale-fixture test failure in `buildStack.test.ts` (see §10). Verify before relying on green.

## 3. Repository / File Structure

```
app/                     Next.js 16 App Router
  page.tsx               Homepage
  deals/ stores/ search/ cards/ resources/   Public pages
  admin/                 Admin portal (protected): signals queue, offer changes, monitor, audit, data quality, stores CRUD, card offers
  api/                   API routes incl. api/cron/monitor-feeds
  robots.ts sitemap.ts opengraph-image.tsx   SEO
  not-found.tsx error.tsx                     Branded 404 / error boundary
  layout.tsx globals.css                      DO NOT TOUCH (see §8)
components/              Shared React components
lib/
  repos/                 Supabase data-access (server-only)
  admin/repos/           Admin-only data-access (service-role isolated)
  monitor/               Feed monitor logic (pure, testable)
  stack/                 Deal-stacking calculation logic
  calculateStack.ts dealCategories.ts structuredData.ts offers/ sources/ env.ts
scripts/                 Seed / fixture / cleanup scripts
tests/  monitor/ stack/ admin/ fixtures/      Vitest suites
supabase/                Migrations + seed SQL
docs/                    Architecture & monitoring docs
PLAN-*.md                10 execution-ready backlog plans (repo root)
vercel.json              Cron: one/day at 02:00 (Hobby limit)
```

## 4. Completed Work

Verified from git history and memory. Commit hashes in parentheses.

- **Feed / monitor:** feed-ingestion-recovery (`53c4a50`), monitor staleness + unfetchable-feed warnings, feed-queue-scalability — cap read at 200, chunk lookups, true backlog (`6c62d04`).
- **Public hardening:** security headers on every response (`07d8049`), branded 404 + error boundary (`831b99e`), public read-path expiry guard AU-timezone (`5f952e7`), unified DST-correct expiring-soon helper (`59a754c`). Range `07d8049..59a754c`.
- **Card offers (LIVE):** migration, admin CRUD, public `/cards` page, seed data (Amex/NAB/CBA/Westpac/ANZ), wired into admin dashboard + data quality + cleanup (`2f0a9fb`). **5/5 published by admin 2026-07-08.**
- **Admin stores CRUD:** immutable id, unpublish-only (`3a2282f`).
- **Offer-change detection:** wired **behind default-off flag, staging-only** (`89c8c26`) — NOT live.
- **SEO:** site-level JSON-LD + generated OG images (`54fe741`), sitemap/robots.
- **Broader taxonomy:** category taxonomy, feed preference + top-deals ranking tuning, queue review presets (`a508746`, `ec6f1b9`, `aa62989`, `81067dd`).
- **Tooling:** `/phase` skill for controlled-phase workflow (`c6daf99`).

## 5. Current Task

**Unknown / none in progress.** Working tree is clean at `54fe741`. The immediately preceding chunk of work (SEO structured data) is committed. No active WIP. Next action = pick from §6.

## 6. Next 3 Tasks

Drawn from the remaining `PLAN-*.md` backlog. Confirm against `git log` before starting — do not re-execute an already-shipped plan. Ordered by architect decision (2026-07-09): **safest work first**.

1. **PLAN-docs-runbook-refresh.md — DO THIS NEXT.** Docs-only refresh of the ops runbook/README/CLAUDE.md to match shipped code (7 migrations not 5, `/cards`, card-offers admin, admin rate limiting, bulk-ignore, `test:admin`/`cleanup:old-deals`). Lowest blast radius — no code/config/test changes (`git diff --stat` must list only `.md` files), can't break build or prod, safe for a parallel worker.
2. **PLAN-generated-db-types.md** — Generate TypeScript types from the Supabase schema for type-safe data access. Deliberately **later**: biggest diff (rank 5/5, "do it last"), needs Supabase auth/network, and may surface real schema drift mid-task. Do after safer work.
3. **PLAN-offer-change-detection-live.md — NOT next.** Take offer-change detection from staging-only/flagged (`89c8c26`) to live. Deferred because of **higher blast radius** (edits the protected monitor cron/entry-points and writes to the DB) and **existing partial wiring** (`89c8c26` already flagged it on, so the plan's "nothing invokes detection yet" assumption needs careful verification first). Highest-value feature, but not the safe next step.

> Other PLAN files (`cards-go-live`, `expired-offer-read-guard`, `feed-ingestion-recovery`, `feed-queue-scalability`, `public-hardening`, `stores-admin-crud`, `structured-data-seo`) appear **already executed** — verify before touching.

## 7. Important Decisions

- **No HTML scraping** — RSS/Atom feed parsing only (`fast-xml-parser`). Costco Hot Buys was done via a compliant approved-signal path, not scraping.
- **No auto-publish** — all feed/offer/signal changes are staged for admin review. Monitor/cron code must never write directly to `ozbargain_signals`.
- **Prod serves the Supabase DB**, not the static fallback files — re-seed after editing static offer data.
- **No Cashrewards references** anywhere.
- **Offer-change detection ships dark first** (flag default-off) before going live.
- **Card offers rows** still say "Illustrative" with null expiry despite being published — intentional placeholder state, revisit before treating as real.

## 8. Constraints

**Hard rules from CLAUDE.md — do not violate:**

- **Secrets:** Never expose Supabase service-role key to client/public code. `lib/admin/repos/` server-side + behind-auth only. Never commit/log `.env`.
- **Cron:** Vercel Hobby = **one cron per day max**. Do not change `vercel.json` to sub-daily. External scheduler (cron-job.org) may hit the secret monitor route ≤ every 3h.
- **Supabase:** Do not change RLS/security policies without explaining first. Migrations reviewed before prod.
- **Do NOT touch** `app/layout.tsx` (root layout) or `app/globals.css` (unless unavoidable).
- **UI:** Preserve premium soft-emerald SaaS style. Australian spelling (colour, favour, organisation), AUD formatting. No redesigns unless a phase calls for it.
- **No AI agents / autonomous publishing workflows.** No bypassing Cloudflare, login pages, robots.txt, or rate limits.
- **Keep changes small and reviewable.** Don't remove existing features.
- **Framework note (AGENTS.md):** This is Next.js 16 with breaking changes vs. training data — read `node_modules/next/dist/docs/` before writing framework code.

## 9. Commands to Run

**Node version matters (see §10):** shell defaults to Node 15; run `nvm use 20` for dev/test/build/lint. `npm run seed` needs **Node 22** (WebSocket).

```bash
npm run dev             # local dev server
npm run build           # production build — MUST pass before commit
npm run lint            # ESLint — MUST pass before commit
npm run test:monitor    # monitor/feed/top-deals/ranking tests
npm run test:stack      # stack/calculation tests
npm run test:admin      # admin tests
npm run seed            # seed base data (Node 22)
npm run seed:feed-items # seed OzBargain feed items
npm run seed:offer-changes
npm run monitor:fixtures
npm run monitor:feeds
npm run cleanup:old-deals
```

**Commit checklist:** 1) `npm run lint` 2) `npm run build` 3) `npm run test:monitor` if monitor/feed logic changed 4) `npm run test:stack` if stack logic changed 5) `git status` — only intended files staged.

## 10. Known Issues / Risks

- **`tests/stack/buildStack.test.ts` — stale-fixture failure since ~2026-07-04.** Clock-triggered: fixtures reference dates that have since expired, so an expiry filter drops them. Pre-existing, **not caused by new work**. Don't treat as a regression from your change; verify by checking if it fails on a clean `main`.
- **Preview server (Node/Turbopack):** `preview_start` running `next dev` needs a zsh `-c` PATH-prefix to Node 20 or Turbopack workers panic. After a panicked run, `rm -rf .next/dev` — the cache stays poisoned otherwise.
- **Prod migration drift:** Some migrations were applied by hand and are untracked. Migration 005 (`hidden_from_homepage`) was found NOT applied to prod on 2026-07-08. **Verify prod schema via `information_schema.columns`, not just table existence.**
- **Seed signals gotcha:** Full `npm run seed` fails on `ozbargain_signals` (source_native_id unique constraint + diverged prod data). Insert new signals **individually**, not via full seed.
- **Card offers** are published but marked "Illustrative" with null expiry — not real offer data yet.
- **Two-account coordination risk:** Both accounts share `main`. Pull/rebase before working; commit small; push promptly to avoid divergence (git workflow is autonomous through to `origin/main`).

## 11. Latest Changes

Most recent commits (newest first):

```
54fe741  Add site-level JSON-LD and generated OG images (SEO)   <- HEAD
579156b  Add execution-ready PLAN backlog files
89c8c26  Wire offer-change detection behind default-off flag (staging-only)
3a2282f  Add /admin/stores CRUD (immutable id, unpublish-only)
59a754c  Unify expiring-soon logic in shared DST-correct AU helper
831b99e  Add branded 404 and error boundary pages
07d8049  Add security headers to every response
6c62d04  Cap feed queue read at 200, chunk signal lookup, show true backlog
5f952e7  Add public read-path expiry guard (AU-timezone filter)
53c4a50  Add monitor staleness alert and unfetchable-feed warnings
```

## 12. Handoff for Other Claude Account

**Read first:** `CLAUDE.md` + `AGENTS.md` (hard rules — §8 summarises them). This project's Next.js 16 differs from training data.

**Before starting any work:**
1. `git pull --rebase` on `main` — the other account may have pushed. Working tree should be clean.
2. `nvm use 20` (Node 22 only for `npm run seed`).
3. Confirm which PLAN you're taking so the two accounts don't collide. The obvious next pickup is **PLAN-offer-change-detection-live.md** (§6).
4. Cross-check the PLAN against `git log --oneline` — several PLANs are already shipped; don't redo them.

**While working:**
- Keep changes small and reviewable; one PLAN/phase at a time. The `/phase` skill runs a controlled phase end-to-end (scope → implement → lint/build/test → commit → push → stop).
- Never violate §8 constraints (no scraping, no auto-publish, one cron/day, don't touch layout/globals.css, no service-role key leakage).
- Run the §9 commit checklist before every commit. Expect the `buildStack.test.ts` failure (§10) — confirm it's pre-existing, not yours.

**When done:**
- Update this file: §2 Current Status, §4 Completed Work (with commit hash), §5 Current Task, §6 Next 3 Tasks, §11 Latest Changes.
- Commit + push to `origin/main` (autonomous — no confirmation needed for routine git).

**If something here is stale or contradicts the code, trust the code and git log, then fix this file.**
