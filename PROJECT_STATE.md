# PROJECT_STATE.md

> Single source of truth for DealStack AU. Maintained so a second Claude account can continue the work safely without losing context.
>
> **Last updated:** 2026-07-10 (production-readiness audit) · **Branch:** `main`

---

## 1. Project Goal

DealStack AU is a **deal-stacking research tool for Australian shoppers**. It combines cashback portals, gift cards, points/rewards programmes, bank & credit-card offers, and OzBargain feed signals into a single interface that shows how to "stack" discounts on a purchase.

- Deployed on **Vercel (Hobby plan)** with a **Supabase Postgres** backend.
- All external feed data is **staged and admin-reviewed before public publication** — nothing auto-publishes.

## 2. Current Status

- **Live/working:** Public site (homepage, `/deals`, `/stores`, `/search`, `/cards`, `/resources`), admin portal (incl. `/admin/cleanup`), feed monitor, feed queue with relevance triage, stacking calculator, CI quality gate, card-offer readiness gate, source-result trust guard, strict production-content smoke, and the audited monitor emergency stop.
- **Current audit:** Top Deals requires approved signal copy; configured Supabase is authoritative; public URL and monitor egress boundaries fail closed; monitor health is externally observable; signal seeding tolerates diverged native ids.
- **In progress / partial:** Offer-change detection is wired, tested, and now has both an `/admin/monitor` ops status card **and** a written go-live/rollback runbook (`docs/ozbargain-monitoring.md`) — but is still **behind a default-off flag (staging-only)**, not live in production. The remaining step is a human one: run the precision review on ≥2 days, then flip `OZB_OFFER_DETECT_ENABLED=true` in Vercel.
- **Recent trust/ops sequence:** public source-result guard (`fbd570a`), final AU expiry unification (`14db2d6`), strict public-content smoke (`e29c1c9`), and audited feed-source emergency stop (`f65c951`) are shipped on `main` after the card readiness gate (`2f2db1d`).
- **Current ranked backlog:** empty — the schema-drift watchdog (`483bd86`) closed the last code task; what remains is human ops/config. See §6.
- **Known prod hygiene (see §10):** two published-but-expired gift cards (`gc-tcn-jbhifi`, `gc-woolworths-wish` from 2026-07-11) — clear via the new `/admin/cleanup` page (or the CLI `npm run cleanup:old-deals -- --write`).
- **Build/lint/tests:** Full Node 20 gate green at `483bd86`: lint, production build, 165 stack tests, 201 monitor tests, 114 admin tests, `git diff --check`, and the structural egress greps (no `URL.canParse` in app/lib, no auto-follow redirects in the monitor, no `fromDbOrStatic` anywhere).

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
PLAN-cards-go-live.md    The only retained root plan; code steps shipped, but
                          issuer-by-issuer production verification remains open.
docs/launch-management/ Current launch backlog, tasks, prompts and decisions.
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
- **2026-07-10 backlog (5/5 shipped):** feed queue relevance filter/sort/select-all-filtered (`8269bc9`); detection ops status card + go-live runbook (`d499d7e`, listed above); `/admin/cleanup` — reviewed one-click apply for expiry hygiene, ported from the CLI script (`919f3d6`); dashboard mark-rechecked (`1c8a20c`, listed above); project-state truthing (`4217595`).
- **CI quality gate:** `.github/workflows/ci.yml` — GitHub Actions runs lint, `test:monitor`, `test:stack`, `test:admin`, `build`, and `start`+`smoke` on every PR and every push to `main`, with zero repository secrets (static-fallback demo data covers build/smoke without Supabase env). First structural fix from the 2026-07-10 follow-on backlog, ranked first because two-account direct pushes to `main` had no gate at all. Verified working on its first real PR (#2, below) — `quality` check passed in 1m12s (`106a5d3`, `34d0fe4`).
- **Card offer public-readiness gate:** `lib/offers/cardReadiness.ts` — one pure rule (confirmed confidence, unexpired date, HTTPS issuer source, positive headline value for the offer type, no placeholder wording) enforced on both the public `/cards` read path (`lib/repos/offers.ts`) and admin insert/update/publish actions (`lib/admin/repos/cardOffers.ts`, card-offers `actions.ts`). Reviewed, verified, and shipped via PR #2, squash `2f2db1d` (branch commit `ea7d3fe`). **Effect: `/cards` now shows its empty state in production** until the 5 illustrative rows are re-verified — see §6 human ops item 3 and §10.
- **Public trust follow-through:** source cards now fail closed on configured DB errors/empty results and enforce expiry/card readiness (`fbd570a`); the last fixed-offset expiry checks use the shared AU calendar (`14db2d6`); strict smoke catches public placeholder/demo leakage (`e29c1c9`).
- **Monitor emergency stop:** `/admin/monitor` can disable all enabled feed sources immediately with rate limiting and an audit record; staged and public content are preserved (`f65c951`).
- **Production trust + monitor ops hardening (`05cc339`, audit report `f01162b` / `AUDIT_REPORT.md`):** the second-backlog bundle, all four plans in one reviewed commit. (a) Homepage Top 5 approval boundary — imported feed state is no longer enough; `lib/repos/topDeals.ts` joins the promoted signal, requires approved/non-sample/live state, maps moderated signal copy, preserves the independent homepage-hidden veto, and ignores feed-source enablement for publication; signal changes revalidate `/`. (b) Live-data trust — `fromDbOrStatic` deleted; configured Supabase is authoritative for every public dataset (empty/error reads stay empty, never demo rows), expired store discount codes suppressed at read time (`guardStoreDiscount`), calculator takes repository-loaded stores as props. (c) URL trust — `lib/security/urlPolicy.ts` enforced at admin writes, public reads, final renders, and monitor egress (manual same-host redirects, 3-hop cap, bounded response bodies); unsafe persisted URLs surface as data-quality flags. (d) Monitor health endpoint (`app/api/health/`, `lib/monitor/health.ts`) for external uptime polling, plus seed tolerance for diverged signal native ids.
- **Launch management (2026-07-10, `857727d` + `8213003`):** `docs/launch-management/` created (backlog, LAUNCH-DECISION = CONDITIONALLY READY, 3 worker tasks + prompts, assignments). First worker task approved after manager review: TASK-002 operator env-docs accuracy (`8213003`) — README required-env table now lists launch-critical `NEXT_PUBLIC_SITE_URL` and marks `OZB_MONITOR_ENABLED` optional; unused `ADMIN_EMAILS` suggestion removed from `.env.example` (admin access is the `admins` table only). Review record: `docs/launch-management/reviews/REVIEW-TASK-002.md`.
- **Schema-drift watchdog (`483bd86`):** `scripts/schema-manifest.ts` (per-column migration ownership: a drift report names the migration that ADDED the column, e.g. 005 for `hidden_from_homepage`) + `tests/admin/schemaManifest.test.ts` (a committed migration missing from the manifest fails `test:admin` — the self-audit that keeps a green probe honest) + `.github/workflows/schema-drift.yml` (weekly Monday 21:00 UTC + manual dispatch, read-only, `main`-only, secrets scoped to the probe step, **Node 22** — supabase-js crashes on Node 20 before probing, reproduced 2026-07-10). Human setup: create the two Actions secrets (checklist §3). Refactored probe verified against live prod: 15/15 tables OK, exit 0.

## 5. Current Task

None — second backlog and audit complete, schema-drift watchdog shipped. Next action = §6.

## 6. Next 3 Tasks

> **Launch management now lives in [`docs/launch-management/`](docs/launch-management/LAUNCH-BACKLOG.md)** (backlog, task files, worker prompts, assignments, launch decision) — created 2026-07-10 at `1fae4ed`. The ops items below are mirrored there as OPS-1..7 with owners and verification steps; three small READY code/docs tasks (TASK-001..003) were added from a fresh audit. Treat that directory as the launch source of truth.

1. Configure the external monitor health alert described in `docs/ozbargain-monitoring.md` (the `/api/health` endpoint is live; an uptime service needs to poll it).
2. Create the two GitHub Actions secrets for the schema-drift watchdog (checklist §3) and run its first manual dispatch to green.
3. Complete the human production-data checks below.

**Also open — three ops steps only a human can perform** (verifying real-world data / making a production judgement call):

1. **Flip `OZB_OFFER_DETECT_ENABLED` live.** Run the precision review in `docs/ozbargain-monitoring.md` (§ Offer-change detection: go-live runbook) on ≥2 different days via `/admin/offer-changes` → Preview, then set the env var in Vercel and redeploy. `/admin/monitor`'s new detection card shows the result. Zero candidates on preview is a healthy, expected outcome — not a blocker.
2. **Clear the two expired-published gift cards.** `gc-tcn-jbhifi` (expired 2026-07-02) and `gc-woolworths-wish` (expires 2026-07-10, so expired from the 11th) — click Unpublish on `/admin/cleanup` (or run `npm run cleanup:old-deals -- --write`). Harmless, one-click, audited.
3. **Replace the 5 illustrative card-offer rows with verified real data — now blocking, not just cosmetic.** Since the readiness gate shipped (§4), these rows are hidden from `/cards` entirely, not just labelled "Illustrative." For each offer: confirm the bonus/fee/eligibility against the issuer's own HTTPS page, set a real `expiry_date`, flip `confidence` to `confirmed`, remove any placeholder wording, then republish from `/admin/card-offers` — the form will now reject the save with a specific reason if any requirement is still unmet. Genuinely needs a human to read the issuer's terms page.

> New implementation work belongs in `docs/launch-management/`; root-level
> shipped plans were removed on 2026-07-10. The retained card plan is an
> operator verification checklist, not a request to rerun its shipped code.

## 7. Important Decisions

- **No HTML scraping** — RSS/Atom feed parsing only (`fast-xml-parser`). Costco Hot Buys was done via a compliant approved-signal path, not scraping.
- **No auto-publish** — all feed/offer/signal changes are staged for admin review. Monitor/cron code must never write directly to `ozbargain_signals`.
- **Prod serves the Supabase DB**, not the static fallback files — re-seed after editing static offer data.
- **No Cashrewards references** anywhere.
- **Offer-change detection ships dark first** (flag default-off) before going live.
- **Card offers rows** still say "Illustrative" with null expiry despite being published — but as of `2f2db1d` a code-level readiness gate hides them from `/cards` and blocks re-publishing until an admin fixes the data (see §6 human ops item 3). No longer just a documented caveat; it's now enforced.

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
- **Feed enablement is operational only.** `feed_sources.is_enabled` controls future monitor requests; it must not unpublish already-approved content.

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
- **Seed signals unique-key divergence (RESOLVED):** full seed now skips and reports rows whose `source_native_id` belongs to a different production id, then continues to later tables.
- **Card offers:** the 5 DB rows remain published but marked "Illustrative" with `confidence='needs-verification'` and null expiry. They are not real offer data and are hidden from `/cards` by `2f2db1d`; `/search` and store source cards enforce the same trust contract as of `fbd570a`. Human verification/republication is still required (see §6 human ops item 3).
- **Two published-but-expired gift cards (prod-verified 2026-07-10):** `gc-tcn-jbhifi` (TCN, expired 2026-07-02) and `gc-woolworths-wish` (Woolworths WISH, expires 2026-07-10 — expired from the 11th). The public read-guard already hides expired offers from actionable listings, so this is DB hygiene, not a live lie. Clear via `/admin/cleanup` (see §6 human ops item 2).
- **Two-account coordination risk:** Both accounts share `main`. Pull/rebase before working; commit small; push promptly to avoid divergence (git workflow is autonomous through to `origin/main`).

## 11. Latest Changes

Most recent commits (newest first):

```
8213003  Docs: correct required env table and remove unused ADMIN_EMAILS (TASK-002)        <- HEAD
857727d  Add launch-management structure: backlog, 3 worker tasks + prompts, launch decision
1fae4ed  Audit fixes: survive malformed feed XML, stamp weekOf on the AU calendar
4af41e6  Docs: stamp schema-drift watchdog shipped (483bd86), refresh PROJECT_STATE
483bd86  Add scheduled schema-drift watchdog with self-auditing manifest
f01162b  Document production readiness audit
05cc339  Harden production trust and monitor operations
f65c951  Add admin monitor actions and feed source updates
e29c1c9  Add --strict-content mode to npm run smoke for public trust regressions
14db2d6  Unify last two expiry checks onto DST-correct AU calendar helpers
fbd570a  Apply public trust guard to source results
eb4d080  Track the remaining second-backlog plan docs
2f2db1d  Add public-readiness gate for card offers (#2)
34d0fe4  Docs: fill in CI workflow commit hash in PROJECT_STATE §11
106a5d3  Add GitHub Actions CI workflow — lint/tests/build/smoke gate on every PR + push to main
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
3. Use `docs/launch-management/LAUNCH-BACKLOG.md` as the task source of truth.
   `PLAN-cards-go-live.md` remains only for its unfinished human verification.

**While working:**
- Keep changes small and reviewable; one PLAN/phase at a time. The `/phase` skill runs a controlled phase end-to-end (scope → implement → lint/build/test → commit → push → stop).
- Never violate §8 constraints (no scraping, no auto-publish, one cron/day, don't touch layout/globals.css, no service-role key leakage).
- Run the §9 commit checklist before every commit. All suites should be green; a red test is a real regression to investigate, not expected noise.

**When done:**
- Update this file: §2 Current Status, §4 Completed Work (with commit hash), §5 Current Task, §6 Next 3 Tasks, §11 Latest Changes.
- Commit + push to `origin/main` (autonomous — no confirmation needed for routine git).

**If something here is stale or contradicts the code, trust the code and git log, then fix this file.**
