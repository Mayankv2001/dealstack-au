# PROJECT_STATE.md

> Single source of truth for DealStack AU. Maintained so a second Claude account can continue the work safely without losing context.
>
> **Last updated:** 2026-07-10 (follow-on backlog) · **Branch:** `claude/prioritize-high-leverage-work-j073xy` (pending PR to `main`) · **Base:** `4217595`

---

## 1. Project Goal

DealStack AU is a **deal-stacking research tool for Australian shoppers**. It combines cashback portals, gift cards, points/rewards programmes, bank & credit-card offers, and OzBargain feed signals into a single interface that shows how to "stack" discounts on a purchase.

- Deployed on **Vercel (Hobby plan)** with a **Supabase Postgres** backend.
- All external feed data is **staged and admin-reviewed before public publication** — nothing auto-publishes.

## 2. Current Status

- **Live/working:** Public site (homepage, `/deals`, `/stores`, `/search`, `/cards`, `/resources`), admin portal (incl. `/admin/cleanup`), feed monitor, feed queue with relevance triage, stacking calculator. Card offers are live (5/5 published by admin, still Illustrative — see below).
- **In progress / partial:** Offer-change detection is wired, tested, and now has both an `/admin/monitor` ops status card **and** a written go-live/rollback runbook (`docs/ozbargain-monitoring.md`) — but is still **behind a default-off flag (staging-only)**, not live in production. The remaining step is a human one: run the precision review on ≥2 days, then flip `OZB_OFFER_DETECT_ENABLED=true` in Vercel.
- **Backlog: the daa2653 backlog (2026-07-08) is fully shipped**, including `dq-mark-rechecked` (`1c8a20c`) — previously the one holdover, now done. **The 2026-07-10 5-plan backlog is fully shipped**: `queue-relevance-triage` (`8269bc9`), `detection-go-live` (`d499d7e`), `admin-cleanup-page` (`919f3d6`), `dq-mark-rechecked` (`1c8a20c`), `state-truthing` (`4217595`). **A fresh 2026-07-10 follow-on backlog of 5 coded plans now exists** — see §6 (it supersedes the earlier "no coded backlog remains" claim; the three human-only ops steps also remain open).
- **Known prod hygiene (see §10):** two published-but-expired gift cards (`gc-tcn-jbhifi`, `gc-woolworths-wish` from 2026-07-11) — clear via the new `/admin/cleanup` page (or the CLI `npm run cleanup:old-deals -- --write`).
- **Build/lint/tests:** All green — `npm run lint`, `npm run build`, and `test:stack` / `test:monitor` / `test:admin` pass. (The former `buildStack.test.ts` stale-fixture failure is resolved — see §10.)

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
PLAN-*.md                28 files; 23 carry a STATUS banner (shipped/superseded/
                          partially shipped) and are historical reference only —
                          the 5 active follow-on backlog plans have no banner:
                          ci-quality-gates, live-data-trust,
                          monitor-health-endpoint, schema-drift-watchdog,
                          seed-signals-conflict
vercel.json              Cron: one/day at 02:00 (Hobby limit)
```

## 4. Completed Work

Verified from git history and memory. Commit hashes in parentheses.

- **Feed / monitor:** feed-ingestion-recovery (`53c4a50`), monitor staleness + unfetchable-feed warnings, feed-queue-scalability — cap read at 200, chunk lookups, true backlog (`6c62d04`).
- **Public hardening:** security headers on every response (`07d8049`), branded 404 + error boundary (`831b99e`), public read-path expiry guard AU-timezone (`5f952e7`), unified DST-correct expiring-soon helper (`59a754c`). Range `07d8049..59a754c`.
- **Card offers (LIVE):** migration, admin CRUD, public `/cards` page, seed data (Amex/NAB/CBA/Westpac/ANZ), wired into admin dashboard + data quality + cleanup (`2f0a9fb`). **5/5 published by admin 2026-07-08.**
- **Admin stores CRUD:** immutable id, unpublish-only (`3a2282f`).
- **Offer-change detection:** wired **behind default-off flag, staging-only** (`89c8c26`), dry-run preview panel (`8404c27`), and an `/admin/monitor` ops status card + written go-live/rollback runbook (`d499d7e`) — still NOT live (flag flip is a human step).
- **SEO:** site-level JSON-LD + generated OG images (`54fe741`), sitemap/robots, `/stores` index hub (`aff00df`), published card offers surfaced in cross-entity search (`36f5434`).
- **Broader taxonomy:** category taxonomy, feed preference + top-deals ranking tuning, queue review presets (`a508746`, `ec6f1b9`, `aa62989`, `81067dd`).
- **Tooling:** `/phase` skill for controlled-phase workflow (`c6daf99`), `npm run verify:schema` read-only migration-drift probe (`49086d0`), `npm run smoke` route/SEO/security-header test (`90a21f6`), stack engine's injectable `now` clock for deterministic tests (`9560080`), docs/runbook refresh to match migrations 006/007 (`c77919d`).
- **Data quality:** placeholder-copy guard flagging "Illustrative" demo text on published rows (`7d2f293`); cashback cap-maths fix, was understating capped cashback ~10× (`c6e31ed`); weekly picks surfaced on `/deals` (`2835137`); generated Supabase types replacing `LooseDB` (`8d2d219`); one-click "Mark re-checked" to clear stale-data flags without a full edit round-trip (`1c8a20c`).
- **2026-07-10 backlog (4/5 shipped):** feed queue relevance filter/sort/select-all-filtered (`8269bc9`); detection ops status card + go-live runbook (`d499d7e`, listed above); `/admin/cleanup` — reviewed one-click apply for expiry hygiene, ported from the CLI script (`919f3d6`); dashboard mark-rechecked (`1c8a20c`, listed above). This file (`state-truthing`) is the 5th, completing now.
- **CI quality gate:** `.github/workflows/ci.yml` — GitHub Actions runs lint, `test:monitor`, `test:stack`, `test:admin`, `build`, and `start`+`smoke` on every PR and every push to `main`, with zero repository secrets (static-fallback demo data covers build/smoke without Supabase env). First structural fix from the 2026-07-10 follow-on backlog, ranked first because two-account direct pushes to `main` had no gate at all.

## 5. Current Task

**None in progress.** `PLAN-ci-quality-gates.md` (rank 1 of the 2026-07-10 follow-on backlog) just shipped — see §4. Next action = one of the remaining 4 follow-on plans in §6, or one of the three human-only ops steps.

## 6. Next 3 Tasks

**The 2026-07-10 follow-on backlog — 5 execution-ready coded plans, ranked by leverage.** Cross-check each against `git log` before starting; do not re-execute a banner-stamped plan.

1. **PLAN-ci-quality-gates.md — DO THIS FIRST.** GitHub Actions gate (lint + 3 test suites + build + smoke) on every PR/push to main, zero secrets. The repo has no CI at all, two accounts push to main autonomously, and on 2026-07-10 two parallel sessions produced overlapping backlogs — this is the structural fix.
2. **PLAN-live-data-trust.md** — extend the card-offers `fromDbOrDemo` rule to gift cards / cashback / points / signals / weekly deals / search pool: sample data becomes demo-mode only, never a live fallback on zero rows or read errors.
3. **PLAN-monitor-health-endpoint.md** — secret-gated `GET /api/health/monitor` returning 503-on-stale so cron-job.org alerts the owner about a stalled pipeline (closes the acknowledged "alerts still pending" gap in docs/ozbargain-monitoring.md item 8).
4. **PLAN-schema-drift-watchdog.md** — weekly scheduled Action running `npm run verify:schema` against prod with repo secrets (drift already bit prod once: migration 005, 2026-07-08).
5. **PLAN-seed-signals-conflict.md** — make `npm run seed` skip-and-report diverged `source_native_id` signals instead of aborting (resolves the §10 manual-insert workaround).

**Also open — three ops steps only a human can perform** (verifying real-world data / making a production judgement call), unchanged from the previous refresh:

1. **Flip `OZB_OFFER_DETECT_ENABLED` live.** Run the precision review in `docs/ozbargain-monitoring.md` (§ Offer-change detection: go-live runbook) on ≥2 different days via `/admin/offer-changes` → Preview, then set the env var in Vercel and redeploy. `/admin/monitor`'s new detection card shows the result. Zero candidates on preview is a healthy, expected outcome — not a blocker.
2. **Clear the two expired-published gift cards.** `gc-tcn-jbhifi` (expired 2026-07-02) and `gc-woolworths-wish` (expires 2026-07-10, so expired from the 11th) — click Unpublish on `/admin/cleanup` (or run `npm run cleanup:old-deals -- --write`). Harmless, one-click, audited.
3. **Replace the 5 illustrative card-offer rows with verified real data** (`PLAN-cards-go-live.md`'s banner — Step 7 done properly): confirm each offer against its issuer source, fix the figures, set a real `expiry_date`, flip `confidence` to `confirmed`. This is the standing item from §7/§10 — genuinely needs a human to read the issuer's terms page.

> If a new `PLAN-*.md` backlog appears in the repo root before you start, prefer it over this list (this file may lag by one commit — check `ls PLAN-*.md` and `head -3` on each for a STATUS banner first).

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

- **`tests/stack/buildStack.test.ts` — stale-fixture failure (RESOLVED).** The stack engine now takes an injectable `now` clock (`buildStackRecommendations(input, spend, data, now)`, default `new Date()`); the stack tests pass a fixed `TEST_NOW` (see `tests/stack/factories.ts`), so time-based expiry/stale warnings no longer drift as the real clock advances.
- **Preview server (Node/Turbopack):** `preview_start` running `next dev` needs a zsh `-c` PATH-prefix to Node 20 or Turbopack workers panic. After a panicked run, `rm -rf .next/dev` — the cache stays poisoned otherwise.
- **Prod migration drift:** Some migrations were applied by hand and are untracked. Migration 005 (`hidden_from_homepage`) was found NOT applied to prod on 2026-07-08. **Verify prod schema via `information_schema.columns`, not just table existence.**
- **Seed signals gotcha:** Full `npm run seed` fails on `ozbargain_signals` (source_native_id unique constraint + diverged prod data). Insert new signals **individually**, not via full seed.
- **Card offers** are published but marked "Illustrative" with `confidence='needs-verification'` and null expiry — not real offer data yet (verified against prod 2026-07-10; see §6 item 3).
- **Two published-but-expired gift cards (prod-verified 2026-07-10):** `gc-tcn-jbhifi` (TCN, expired 2026-07-02) and `gc-woolworths-wish` (Woolworths WISH, expires 2026-07-10 — expired from the 11th). The public read-guard already hides expired offers from actionable listings, so this is DB hygiene, not a live lie. Clear via `/admin/cleanup` (see §6 item 2).
- **Two-account coordination risk:** Both accounts share `main`. Pull/rebase before working; commit small; push promptly to avoid divergence (git workflow is autonomous through to `origin/main`).

## 11. Latest Changes

Most recent commits (newest first):

```
106a5d3  Add GitHub Actions CI workflow — lint/tests/build/smoke gate on every PR + push to main   <- HEAD
1c8a20c  Add one-click Mark re-checked to dashboard data-quality flags
919f3d6  Add /admin/cleanup — reviewed one-click apply for expiry hygiene
d499d7e  Add detection ops status to /admin/monitor + go-live runbook
8269bc9  Add relevance filter, sort and select-all-filtered to feed queue triage
cb3f904  Add 2026-07-10 ranked 5-plan backlog
49086d0  Add npm run verify:schema — read-only migration drift probe
aff00df  Add /stores index page — public hub for the SEO backbone
90a21f6  Add npm run smoke — route/SEO/security-header smoke test
7d2f293  Add placeholder-copy data-quality guard
daa2653  Add next 5-plan backlog (ranked): placeholder guard, schema verify, smoke, stores index, re-check
```

## 12. Handoff for Other Claude Account

**Read first:** `CLAUDE.md` + `AGENTS.md` (hard rules — §8 summarises them). This project's Next.js 16 differs from training data.

**Before starting any work:**
1. `git pull --rebase` on `main` — the other account may have pushed. Working tree should be clean.
2. `nvm use 20` (Node 22 only for `npm run seed`).
3. **No coded `PLAN-*.md` backlog remains as of 2026-07-10** — see §6 for the three human-only ops steps, or pick a fresh task with the user. If a new backlog has appeared since, confirm which PLAN you're taking so the two accounts don't collide.
4. Cross-check any PLAN against `git log --oneline` AND `head -3 PLAN-<name>.md` (18 of the repo's PLAN files carry a `STATUS (2026-07-10)` banner marking them SHIPPED/SUPERSEDED/PARTIALLY SHIPPED — do not re-execute one) — several PLANs are already shipped; don't redo them.

**While working:**
- Keep changes small and reviewable; one PLAN/phase at a time. The `/phase` skill runs a controlled phase end-to-end (scope → implement → lint/build/test → commit → push → stop).
- Never violate §8 constraints (no scraping, no auto-publish, one cron/day, don't touch layout/globals.css, no service-role key leakage).
- Run the §9 commit checklist before every commit. All suites should be green; a red test is a real regression to investigate, not expected noise.

**When done:**
- Update this file: §2 Current Status, §4 Completed Work (with commit hash), §5 Current Task, §6 Next 3 Tasks, §11 Latest Changes.
- Commit + push to `origin/main` (autonomous — no confirmation needed for routine git).

**If something here is stale or contradicts the code, trust the code and git log, then fix this file.**
