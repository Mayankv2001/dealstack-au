@AGENTS.md

# DealStack AU — Claude Project Instructions

## Project Overview
DealStack AU is a deal-stacking platform for Australian shoppers that combines cashback portals, gift cards, and points programmes into a single research tool. It is deployed on Vercel (Hobby plan) with a Supabase Postgres backend.

## Tech Stack
- **Framework:** Next.js 16 (App Router, React 19, TypeScript)
- **Styling:** Tailwind CSS v4 + shadcn/ui (soft-emerald SaaS palette)
- **Backend:** Supabase (Postgres + RLS + Edge Functions)
- **Hosting:** Vercel (Hobby plan — one cron per day max)
- **Feed parsing:** fast-xml-parser (RSS/Atom only — no HTML scraping)
- **Tests:** Vitest

## Commands
```bash
npm run dev            # local dev server
npm run build          # production build (must pass before committing)
npm run lint           # ESLint (must pass before committing)
npm run typecheck      # tsc --noEmit incl. tests — CI runs this; must pass before committing
npm run test           # every Vitest suite in tests/ (one whole-tree run)
npm run test:e2e       # Playwright browser flows (needs a static-mode build first)
npm run smoke          # HTTP smoke test against a running production build
npm run seed           # seed base data
npm run gift-card:ingest      # manual GCDB ingest (dry-run; --only=<ids>, --write to stage)
npm run cleanup:old-deals  # dry-run unpublish/expire pass (-- --write to apply)
```

## Architecture
```
app/                   Next.js App Router pages & API routes
                       Public pages sit at the root: deals, stores, search,
                       gift-cards, cashback, cards, rewards
  admin/(protected)/   Admin portal: gift cards, cashback, points, transfer
                       bonuses, card offers, weekly deals, audit, cleanup
  api/                 API routes: cron, health, reports, client-error, csp-report
components/            Shared React components
lib/
  repos/               Supabase data-access functions (server-side only)
  admin/repos/         Admin-only data-access (service-role isolated)
  giftcards/           Gift-card lifecycle, value and acceptance logic
  rewards/             Points programmes, transfer bonuses, offer dates
  stack/               Deal-stacking calculation logic
scripts/               One-off seed / fixture scripts
tests/                 Vitest suites, one directory per area (admin, deals,
                       decision, feeds, giftcards, stack, text) plus e2e/
                       (Playwright) and fixtures/ (support files)
docs/                  Architecture and monitoring documentation
supabase/              Migrations and seed SQL
```

## Safety Rules

### Secrets & Access
- Never expose the Supabase service-role key to client code or public routes.
- Admin data-access (`lib/admin/repos/`) must only be called from server components or API routes behind auth.
- Do not add, log, or commit `.env` values.

### Data & Publishing
- All external feed data (gift-card ingest candidates) must be staged and reviewed by an admin before public publication.
- Do not auto-publish, auto-import, or auto-apply any offer changes.
- Do not update cashback/gift-card/points offers without admin review.
- No Cashrewards references anywhere.

### Cron / Monitoring
- Vercel Hobby plan: one cron per day maximum. Do not change `vercel.json` schedule to sub-daily.
- `/api/cron/daily-cleanup` is the only Vercel cron: it unpublishes expired offers and makes no outbound requests. The gift-card jobs run from GitHub Actions.
- Do not change the gift-card ingest gate logic or fetching behaviour unless a phase explicitly requires it.
- Do not scrape HTML pages — RSS/Atom feed parsing only.
- OzBargain has been removed from the product. Do not reintroduce OzBargain ingestion, signals or feed monitoring.

### Supabase
- Do not change RLS or security policies unless explicitly needed and explained first.
- Migrations must be reviewed before applying to production.

### UI
- Preserve the premium soft-emerald SaaS visual style.
- Use Australian spelling (colour, favour, organisation) and AUD formatting.
- Do not redesign existing pages unless a phase explicitly calls for it.

### Code Changes
- Do not remove existing features unless explicitly required.
- Do not touch `app/layout.tsx` (root layout).
- Do not touch `app/globals.css` unless absolutely unavoidable.
- Do not add AI agents or autonomous publishing workflows.
- Do not bypass Cloudflare, login pages, robots.txt, or rate limits.
- Keep changes small and reviewable.

## Commit Checklist
Before every commit:
1. `npm run lint` — must pass
2. `npm run typecheck` — must pass (`next build` does NOT typecheck `tests/`; CI does)
3. `npm run build` — must pass
4. `npm run test` — must pass; one run covers every Vitest suite, so there is
   no longer a judgement call about which suites a change touches
5. `git status` — confirm only intended files are staged

### A new migration is not just a migration
`scripts/schema-manifest.ts` fails closed on any migration file it does not
know about, and that check lives in `test:admin` — so adding a file under
`supabase/migrations/` breaks a test that looks unrelated to it. Whenever you
add one, register it in `COVERED_MIGRATIONS` and declare its tables/columns in
`EXPECTED_SCHEMA` **in the same commit**.

### When in doubt, run what CI runs
CI's `quality` job (`.github/workflows/ci.yml`) is the real gate: lint, `tsc
--noEmit`, `test`, `build`, `smoke`, then Playwright `test:e2e`. The checklist
above covers everything except `smoke` and `test:e2e`, so run those two as
well before anything that touches routing, rendering or the production build.
`build`, `smoke` and `test:e2e` need `DATA_SOURCE=static` and
`DATA_SOURCE_STATIC_PREVIEW_ACK=serve-demo-data-not-production`.

A new `tests/<name>/` directory needs no registration — `npm run test` runs
the whole tree. `scripts/test-suite-manifest.ts` guards that property: it
fails if the scripts are ever narrowed back to per-directory runs, or if a
test script exists that CI never calls.
