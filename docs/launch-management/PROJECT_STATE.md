# PROJECT_STATE.md

> **2026-07-17 gift-card platform update:** since 2026-07-11 the project shipped
> the full gift-card intelligence platform (see §5 for the authoritative
> migration-ledger state — production is applied through **037**), the OzBargain
> expiry recheck, the automated daily deal pipeline, the rebuilt public deals
> discovery + purchase planning experience, the redesign usability/trust audit,
> the Point Hacks weekly ingest configuration (default off), and the homepage
> gift-card marquee. An email-alert subscription system was implemented
> (`fb5a14d`) and then deliberately deferred/reverted (`15facc1`) — it is NOT in
> the codebase.

> Single source of truth for DealStack AU. Maintained so a second Claude account can continue the work safely without losing context.
>
> **Last updated:** 2026-07-23 (migration-truth reconciliation — 036/037 offer-expiry RLS applied 2026-07-22; prod verified through 037) · previously 2026-07-22 · **Branch:** `main`

---

## 1. Project Goal

DealStack AU is a **deal-stacking research tool for Australian shoppers**. It combines cashback portals, gift cards, points/rewards programmes, bank & credit-card offers, and OzBargain feed signals into a single interface that shows how to "stack" discounts on a purchase.

- Deployed on **Vercel (Hobby plan)** with a **Supabase Postgres** backend.
- All external feed data is **staged and admin-reviewed before public publication** — nothing auto-publishes.

## 2. Current Status

- **Live/working:** Public site (homepage, `/deals`, `/stores`, `/search`, `/cards`, `/resources`), admin portal (incl. `/admin/cleanup`), feed monitor, feed queue with relevance triage, stacking calculator, CI quality gate, card-offer readiness gate, source-result trust guard, strict production-content smoke, and the audited monitor emergency stop.
- **Multi-retailer product comparison:** approved signals can share an exact admin-assigned `product_group` key. `/search` then presents one comparison with the best current signal per distinct retailer, sorted by effective post-stack price. Ungrouped, malformed, single-retailer, and merchant-less groups retain the existing standalone cards; no automatic product clustering or production backfill occurs.
- **Current audit:** Top Deals requires approved signal copy; configured Supabase is authoritative; public URL and monitor egress boundaries fail closed; monitor health is externally observable; signal seeding tolerates diverged native ids.
- **Card-offer production state:** All 5 rows were checked against current issuer pages on 2026-07-10. Amex Qantas Ultimate is confirmed, has a fixed 2026-07-28 expiry, and is published. NAB, Westpac and ANZ were corrected and confirmed but remain unpublished because the issuer pages provide no fixed expiry; the obsolete CommBank Low Fee Gold promotion remains unpublished. Five `direct-card-offer-verification` audit entries record the user-authorised update.
- **In progress / partial:** Offer-change detection is wired, tested, and now has both an `/admin/monitor` ops status card **and** a written go-live/rollback runbook (`docs/ozbargain-monitoring.md`) — but is still **behind a default-off flag (staging-only)**, not live in production. The remaining step is a human one: run the precision review on ≥2 days, then flip `OZB_OFFER_DETECT_ENABLED=true` in Vercel.
- **Recent trust/ops sequence:** public source-result guard (`fbd570a`), final AU expiry unification (`14db2d6`), strict public-content smoke (`e29c1c9`), and audited feed-source emergency stop (`f65c951`) are shipped on `main` after the card readiness gate (`2f2db1d`).
- **Gift-card platform (2026-07-12 → 2026-07-17):** full pipeline live behind admin review — GCDB + Point Hacks weekly sources (both default-off, quadruple-gated), accuracy model, programmes/rates tables, offer detail fields, occurrence history, predictions, job runs, lifecycle orchestration and approval hardening. Migrations **021–037 are applied to prod** (see §5). 13 gift-card offers published; public surfaces: `/gift-cards`, `/gift-cards/[id]`, homepage marquee.
- **Public UX (2026-07-13 → 2026-07-15):** rebuilt deals discovery, redesigned purchase planning experience, redesign usability/trust audit fixes (`2ae5c83`), DealCard list view, gift-card offer marquee.
- **Current ranked backlog:** the gated prod-migration runbook is the sole engineering item; the rest is human ops/config. See §5–§6.
- **Prod hygiene: CLEAN as of 2026-07-11.** The two expired-published gift cards (`gc-tcn-jbhifi`, `gc-woolworths-wish`) were unpublished via `npm run cleanup:old-deals -- --write` (user-authorised, 2 audited `auto-unpublish-expired` rows); re-run dry-run reports 0 candidates.
- **Build/lint/tests:** Node 20 gate green on 2026-07-17: lint, production build, 263 admin tests (39 files). Full-suite counts last verified 2026-07-14 during the redesign audit (vitest 1030/1030, e2e 59/59). `npm run verify:schema` is green — migration 031 is applied to prod and the historical fixed_points drift is resolved.

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
docs/launch-management/ Current launch backlog, tasks, prompts and decisions.
vercel.json              Cron: one/day at 02:00 (Hobby limit)
```

## 4. Completed Work

Verified from git history and memory. Commit hashes in parentheses.

- **Feed / monitor:** feed-ingestion-recovery (`53c4a50`), monitor staleness + unfetchable-feed warnings, feed-queue-scalability — cap read at 200, chunk lookups, true backlog (`6c62d04`).
- **Public hardening:** security headers on every response (`07d8049`), branded 404 + error boundary (`831b99e`), public read-path expiry guard AU-timezone (`5f952e7`), unified DST-correct expiring-soon helper (`59a754c`). Range `07d8049..59a754c`.
- **Card offers (LIVE):** migration, admin CRUD, public `/cards` page, seed data (Amex/NAB/CBA/Westpac/ANZ), wired into admin dashboard + data quality + cleanup (`2f0a9fb`). The 2026-07-10 issuer review replaced all illustrative copy and figures: 1 fixed-expiry offer is published and 4 rows are deliberately withheld by the readiness policy.
- **Admin stores CRUD:** immutable id, unpublish-only (`3a2282f`).
- **Offer-change detection:** wired **behind default-off flag, staging-only** (`89c8c26`), dry-run preview panel (`8404c27`), and an `/admin/monitor` ops status card + written go-live/rollback runbook (`d499d7e`) — still NOT live (flag flip is a human step).
- **SEO:** site-level JSON-LD + generated OG images (`54fe741`), sitemap/robots, `/stores` index hub (`aff00df`), published card offers surfaced in cross-entity search (`36f5434`).
- **Broader taxonomy:** category taxonomy, feed preference + top-deals ranking tuning, queue review presets (`a508746`, `ec6f1b9`, `aa62989`, `81067dd`).
- **Tooling:** `/phase` skill for controlled-phase workflow (`c6daf99`), `npm run verify:schema` read-only migration-drift probe (`49086d0`), `npm run smoke` route/SEO/security-header test (`90a21f6`), stack engine's injectable `now` clock for deterministic tests (`9560080`), docs/runbook refresh to match migrations 006/007 (`c77919d`).
- **Data quality:** placeholder-copy guard flagging "Illustrative" demo text on published rows (`7d2f293`); cashback cap-maths fix, was understating capped cashback ~10× (`c6e31ed`); weekly picks surfaced on `/deals` (`2835137`); generated Supabase types replacing `LooseDB` (`8d2d219`); one-click "Mark re-checked" to clear stale-data flags without a full edit round-trip (`1c8a20c`).
- **2026-07-10 backlog (5/5 shipped):** feed queue relevance filter/sort/select-all-filtered (`8269bc9`); detection ops status card + go-live runbook (`d499d7e`, listed above); `/admin/cleanup` — reviewed one-click apply for expiry hygiene, ported from the CLI script (`919f3d6`); dashboard mark-rechecked (`1c8a20c`, listed above); project-state truthing (`4217595`).
- **CI quality gate:** `.github/workflows/ci.yml` — GitHub Actions runs lint, `test:monitor`, `test:stack`, `test:admin`, `build`, and `start`+`smoke` on every PR and every push to `main`, with zero repository secrets (static-fallback demo data covers build/smoke without Supabase env). First structural fix from the 2026-07-10 follow-on backlog, ranked first because two-account direct pushes to `main` had no gate at all. Verified working on its first real PR (#2, below) — `quality` check passed in 1m12s (`106a5d3`, `34d0fe4`).
- **Card offer public-readiness gate:** `lib/offers/cardReadiness.ts` — one pure rule (confirmed confidence, unexpired date, HTTPS issuer source, positive headline value for the offer type, no placeholder wording) enforced on both the public `/cards` read path (`lib/repos/offers.ts`) and admin insert/update/publish actions (`lib/admin/repos/cardOffers.ts`, card-offers `actions.ts`). Reviewed, verified, and shipped via PR #2, squash `2f2db1d` (branch commit `ea7d3fe`). The issuer review completed 2026-07-10: `/cards` exposes only the confirmed Amex offer with a fixed expiry; current offers without a fixed issuer expiry remain unpublished.
- **Public trust follow-through:** source cards now fail closed on configured DB errors/empty results and enforce expiry/card readiness (`fbd570a`); the last fixed-offset expiry checks use the shared AU calendar (`14db2d6`); strict smoke catches public placeholder/demo leakage (`e29c1c9`).
- **Monitor emergency stop:** `/admin/monitor` can disable all enabled feed sources immediately with rate limiting and an audit record; staged and public content are preserved (`f65c951`).
- **Production trust + monitor ops hardening (`05cc339`, audit report `f01162b` / `AUDIT_REPORT.md`):** the second-backlog bundle, all four plans in one reviewed commit. (a) Homepage Top 5 approval boundary — imported feed state is no longer enough; `lib/repos/topDeals.ts` joins the promoted signal, requires approved/non-sample/live state, maps moderated signal copy, preserves the independent homepage-hidden veto, and ignores feed-source enablement for publication; signal changes revalidate `/`. (b) Live-data trust — `fromDbOrStatic` deleted; configured Supabase is authoritative for every public dataset (empty/error reads stay empty, never demo rows), expired store discount codes suppressed at read time (`guardStoreDiscount`), calculator takes repository-loaded stores as props. (c) URL trust — `lib/security/urlPolicy.ts` enforced at admin writes, public reads, final renders, and monitor egress (manual same-host redirects, 3-hop cap, bounded response bodies); unsafe persisted URLs surface as data-quality flags. (d) Monitor health endpoint (`app/api/health/`, `lib/monitor/health.ts`) for external uptime polling, plus seed tolerance for diverged signal native ids.
- **Launch management (2026-07-10, `857727d` + `8213003`):** `docs/launch-management/` created (backlog, LAUNCH-DECISION = CONDITIONALLY READY, 3 worker tasks + prompts, assignments). First worker task approved after manager review: TASK-002 operator env-docs accuracy (`8213003`) — README required-env table now lists launch-critical `NEXT_PUBLIC_SITE_URL` and marks `OZB_MONITOR_ENABLED` optional; unused `ADMIN_EMAILS` suggestion removed from `.env.example` (admin access is the `admins` table only). Review record: `docs/launch-management/reviews/REVIEW-TASK-002.md`. Second worker task approved 2026-07-11: TASK-001 migration 008 pinning `set_updated_at()`'s search_path (`37854b0`) — clears the sole Supabase advisor WARN once applied; registered in the schema manifest, checklist §3 and production-readiness docs updated. Migration 008 **applied to prod 2026-07-11** (user-authorised, manager-applied via Supabase API): `proconfig` = `search_path=""`, advisor WARN cleared, ledger entry recorded. Review record: `docs/launch-management/reviews/REVIEW-TASK-001.md`. Third and final worker task approved 2026-07-11: TASK-003 `/deals` disclaimer wording (`6845117`) — "cached examples" → "served from a cache", verified serving on live prod with strict smoke 28/28. **Worker backlog complete**; remaining launch work is operational only. Review record: `docs/launch-management/reviews/REVIEW-TASK-003.md`.
- **Schema-drift watchdog (`483bd86`):** `scripts/schema-manifest.ts` (per-column migration ownership: a drift report names the migration that ADDED the column, e.g. 005 for `hidden_from_homepage`) + `tests/admin/schemaManifest.test.ts` (a committed migration missing from the manifest fails `test:admin` — the self-audit that keeps a green probe honest) + `.github/workflows/schema-drift.yml` (weekly Monday 21:00 UTC + manual dispatch, read-only, `main`-only, secrets scoped to the probe step, **Node 22** — supabase-js crashes on Node 20 before probing, reproduced 2026-07-10). Human setup: create the two Actions secrets (checklist §3). Refactored probe verified against live prod: 15/15 tables OK, exit 0.
- **Multi-retailer product comparison (2026-07-11):** migration 014 adds nullable `ozbargain_signals.product_group`; signal admin CRUD validates and exposes the exact key and requires store + exact product URL + parseable AUD price before grouping. Smart Stack includes the canonical key in product search, groups only approved/live matching signals with at least two distinct retailers, deduplicates each retailer to its best comparable offer, sorts unknown legacy prices last, and renders truthful retailer/source links, stack layers, alternatives, and warnings. Static demo rows exercise the browser flow but are excluded from production seeding. Production schema probe confirms the column is present; no rows were automatically grouped.

## 5. Current Task

**Single source of truth for migration state:** the live Supabase ledger
(`list_migrations` / `npm run verify:schema`) is authoritative. This section and
`docs/supabase-migration-ledger-reconciliation-2026-07-16.md` (point-in-time
history only — do not read it as current) must be reconciled to it, not to each
other.

As verified 2026-07-23 (`list_migrations` on project `numgsivlrglflsnqehac`), the
production ledger is canonical through **037**: 027–032 were applied one at a
time on 2026-07-17, and 033 (approval/publication hardening), 034 (value
structures) and 035 (purchase-limits persistence) on 2026-07-21 — each in its
own transaction after a verified logical backup. Migrations **036** (offer-expiry
read policies) and **037** (`card_offers` realigned Melbourne→Sydney) were
applied 2026-07-22 — policy-only, tightening/visibility-neutral; schema
verification is green (**37/37 tables**). 036/037 are the belt-and-suspenders RLS
layer: the read-time boundary and daily cleanup already enforce Sydney-inclusive
expiry, and now every public offer table also bounds visibility by the Sydney
expiry date at the DB layer (see `docs/offer-expiry-semantics.md`). Product,
acceptance and programme tables are truthfully empty until separately reviewed
data is approved.

Side effect of 033's stricter RLS (`confidence='confirmed'` required for public
reads): two legacy `needs-verification` offers (`gc-apple-points`,
`gc-coles-group-bonus-points`) are hidden from public reads until re-reviewed to
`confirmed` — not deleted.

## 6. Next 3 Tasks

> **Launch management now lives in [`docs/launch-management/`](docs/launch-management/LAUNCH-BACKLOG.md)** (backlog, task files, worker prompts, assignments, launch decision) — created 2026-07-10 at `1fae4ed`. Treat that directory as the launch source of truth.

1. **(Done 2026-07-21.)** The 10 legacy gift-card offers were reviewed and
   migration 033 applied. The one remaining follow-up is a re-review of the two
   rows 033's stricter RLS now hides (`gc-apple-points`,
   `gc-coles-group-bonus-points`) — promote to `confidence='confirmed'` to
   restore them to public reads, or archive with evidence.
2. **Add the missing GitHub Actions `CRON_SECRET` secret** (monitor-health job is
   red by design without it; the Vercel value is sensitive and cannot be pulled
   back — regenerate or copy from the original source). Then triage the
   data-health 503 on the real overdue reviews it will surface.
3. **Flip `OZB_OFFER_DETECT_ENABLED` live** after the ≥2-day precision review in
   `docs/ozbargain-monitoring.md`; and configure the external monitor health
   alert (an uptime service polling `/api/health`).

**Also pending (dated):** re-verify the four unpublished card offers against
issuer pages by **2026-08-09**; review the 24 GCDB candidates + 15 `new`
candidates in `/admin/gift-cards/review`. `git stash@{0}` is a verified-stale
duplicate of already-committed work — safe to `git stash drop`, never apply.

> New implementation work belongs in `docs/launch-management/`; completed
> root-level plans were removed on 2026-07-10.

## 7. Important Decisions

- **No HTML scraping** — RSS/Atom feed parsing only (`fast-xml-parser`). Costco Hot Buys was done via a compliant approved-signal path, not scraping.
- **No auto-publish** — all feed/offer/signal changes are staged for admin review. Monitor/cron code must never write directly to `ozbargain_signals`.
- **Prod serves the Supabase DB**, not the static fallback files — re-seed after editing static offer data.
- **No Cashrewards references** anywhere.
- **Offer-change detection ships dark first** (flag default-off) before going live.
- **Card offers fail closed.** A row is public only when it is confirmed, current, sourced to an HTTPS issuer page, free of placeholder copy, has a positive headline value, and has a fixed expiry. Current issuer offers without a fixed expiry stay unpublished rather than receiving an invented date.

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
- **Prod migration drift:** historically hand-applied and untracked (005 found missing 2026-07-08; 025 applied pre-`fixed_points`). Fully mapped 2026-07-16 — remote ledger rows exist for 20 migrations under timestamp aliases; the repair + apply plan is `docs/supabase-migration-ledger-reconciliation-2026-07-16.md` (historical — 027–035 have since been applied and the ledger renamed to canonical versions; see §5 for current state). **Verify prod schema via `information_schema.columns`, not just table existence.**
- **Seed signals unique-key divergence (RESOLVED):** full seed now skips and reports rows whose `source_native_id` belongs to a different production id, then continues to later tables.
- **Card offers (RESOLVED 2026-07-10):** all 5 DB rows were checked against issuer sources and stripped of illustrative copy. Amex Qantas Ultimate is the sole published row because it has a fixed expiry; corrected NAB, Westpac and ANZ rows have no issuer-stated fixed expiry and remain unpublished; the obsolete CommBank promotion remains unpublished. `/cards`, `/search` and store source cards enforce the same trust contract.
- **Two published-but-expired gift cards (RESOLVED 2026-07-11):** `gc-tcn-jbhifi` and `gc-woolworths-wish` unpublished via the audited cleanup CLI (`auto-unpublish-expired` audit rows); re-run dry-run reports 0 candidates. The public read-guard had already hidden them from actionable listings throughout.
- **Two-account coordination risk:** Both accounts share `main`. Pull/rebase before working; commit small; push promptly to avoid divergence (git workflow is autonomous through to `origin/main`).

## 11. Latest Changes

Most recent commits (newest first):

```
6e85115  fix(giftcards): extend migration 031 to occurrence-history fixed_points drift     <- HEAD 2026-07-17
802087c  feat(giftcards): add Point Hacks weekly gift-card ingest configuration
9ddee5a  Add comprehensive tests for gift card reconciliation and related functionalities
811542f  Add gift-card offer marquee to the homepage
21e25a8  feat: redesign purchase planning experience
84ac591  feat(giftcards): enhance weekly offers and ingestion features
2ae5c83  fix: complete redesign usability and trust audit
15facc1  revert: defer email alert infrastructure
fb5a14d  feat: implement email alert subscription system with double opt-in
2097a83  IT-03: harden gift-card pipeline validation and rollout
bc8c707  feat(giftcards): add ongoing gift card programmes and rates tables
05d6d00  feat(giftcards): add detailed offer fields and acceptance model
b541521  chore: regenerate DB types after applying migration 021 to prod
341cef3  Rebuild public deals discovery experience
4ec0fdf  Schedule OzBargain expiry recheck
3d28718  Add RSS-based OzBargain expiry recheck
c86db33  Add automated daily deal review pipeline
e5e7a38  Add multi-retailer product comparisons
5f00a76  Record TASK-003 implementation in launch backlog/assignments                      <- HEAD at 2026-07-11 review
6845117  Fix /deals disclaimer: curated cached data, not "examples" (TASK-003)
1eca5c2  Approve TASK-001: manager review record, backlog/assignments/state updates
37854b0  Add migration 008: pin set_updated_at search_path (TASK-001)
d733bdc  Complete card offer production verification
5ff3d13  Remove completed root plan files
cd52a2e  Approve TASK-002: manager review record, backlog/assignments/state updates
8213003  Docs: correct required env table and remove unused ADMIN_EMAILS (TASK-002)
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

**While working:**
- Keep changes small and reviewable; one PLAN/phase at a time. The `/phase` skill runs a controlled phase end-to-end (scope → implement → lint/build/test → commit → push → stop).
- Never violate §8 constraints (no scraping, no auto-publish, one cron/day, don't touch layout/globals.css, no service-role key leakage).
- Run the §9 commit checklist before every commit. All suites should be green; a red test is a real regression to investigate, not expected noise.

**When done:**
- Update this file: §2 Current Status, §4 Completed Work (with commit hash), §5 Current Task, §6 Next 3 Tasks, §11 Latest Changes.
- Commit + push to `origin/main` (autonomous — no confirmation needed for routine git).

**If something here is stale or contradicts the code, trust the code and git log, then fix this file.**
