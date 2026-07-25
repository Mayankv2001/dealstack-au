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
npm run test:feeds     # tests for the gift-card feed fetcher
npm run test:stack     # tests for stack/calculation logic
npm run seed           # seed base data
npm run gift-card:ingest      # manual GCDB ingest (dry-run; --only=<ids>, --write to stage)
npm run test:admin     # tests for admin rate-limit/db-fallback logic
npm run cleanup:old-deals  # dry-run unpublish/expire pass (-- --write to apply)
```

## Architecture
```
app/                   Next.js App Router pages & API routes
  (public)/            Public pages: homepage, deals, stores, search
  admin/(protected)/   Admin portal: signals queue, offer changes, monitor, audit, data quality
  api/                 API routes including cron trigger endpoint
components/            Shared React components
lib/
  repos/               Supabase data-access functions (server-side only)
  admin/repos/         Admin-only data-access (service-role isolated)
  monitor/             Feed monitor logic (pure, testable)
  stack/               Deal-stacking calculation logic
scripts/               One-off seed / fixture scripts
tests/
  monitor/             Vitest tests for monitor/ranking/top-deals logic
  stack/               Vitest tests for stacking calculations
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
4. `npm run test:feeds` — if the gift-card feed fetcher changed
5. `npm run test:stack` — if stack/calculation logic changed
6. `npm run test:admin` — if admin action/rate-limit/fallback logic changed
7. `git status` — confirm only intended files are staged
