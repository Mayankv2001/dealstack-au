# DealStack AU

A deal-stacking platform for Australian shoppers that combines cashback portals, gift cards, points programmes, and OzBargain feed signals into a single research tool. Built as a full-stack portfolio project demonstrating Next.js 16, Supabase, and responsible data-pipeline design.

---

## Features

### Public Site
- **Homepage** — Top 5 OzBargain signals (admin-curated), popular stores, and search entry point
- **Deals directory** — Browse and filter curated deals with AUD pricing
- **Store pages** — Per-store cashback, gift-card, and points stacking details
- **Search** — Live cross-entity search across deals, stores, and card offers
- **Card offers** — compare bank & credit-card sign-up offers at /cards (manually verified, admin-published)

### Admin Portal (`/admin`)
- **Feed queue** — Review staged OzBargain feed items; import is one-at-a-time and nothing is ever bulk-imported or auto-published; a scoped bulk **ignore** exists for keyword-filtered items
- **Offer changes** — Review detected cashback/gift-card rate changes before applying; full audit trail
- **Top 5 visibility** — Control which signals appear on the homepage (hidden_from_homepage flag per item)
- **Card offers CRUD** — Create, edit, publish/unpublish bank & credit-card offers shown at `/cards`
- **Admin rate limiting** — A per-admin mutation budget (rolling window, backed by a Postgres ledger) throttles admin Server Actions so a runaway script or fat-fingered bulk action can't hammer the database
- **Compliance controls** — Compliance review gate that must be on file before feed monitoring activates
- **Audit log** — Append-only log of every admin action
- **Data quality report** — Surface missing rates, stale data, and coverage gaps
- **Cron monitor** — Verify the last successful feed run and scheduler health

### Safe Feed Automation
- OzBargain RSS monitoring is **gated and off by default** — requires `OZB_MONITOR_ENABLED=true` plus a compliance review row in the database
- Feed items are **staged for mandatory admin review** and never auto-published
- Offer changes are **staged as candidates** and never auto-applied
- No Cashrewards data anywhere
- RSS/Atom parsing only — no HTML scraping, no bypassing robots.txt

---

## Architecture

```
app/                      Next.js 16 App Router
  (public)/               Homepage, deals, stores, search — reads Supabase with anon key
  admin/(protected)/      Admin portal — server components, service-role isolated
  api/cron/               Secret-gated monitor route (never called client-side)
components/               Shared React components (shadcn/ui base)
lib/
  repos/                  Public data-access (anon key, RLS enforced)
  admin/repos/            Admin data-access (service-role, server-only)
  monitor/                Feed monitor logic — pure, tested, no DB side-effects
  stack/                  Deal-stacking calculation helpers
tests/
  monitor/                Vitest tests for feed parsing, signal ranking, and top-deals logic
  stack/                  Vitest tests for stacking calculations and source result ranking
supabase/migrations/      Postgres migrations (apply manually or via Supabase CLI)
docs/                     Monitoring and architecture documentation
```

**Key safety boundary:** the Supabase service-role key is only used inside `lib/admin/repos/` and the cron API route — never in client components or public routes.

---

## Local Setup

```bash
# Prerequisites: Node 20+, a Supabase project with migrations applied

cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

npm install
npm run dev
```

### Seed data
```bash
npm run seed               # base stores/deals
npm run seed:feed-items    # sample OzBargain feed items
npm run seed:offer-changes # sample offer change candidates
npm run cleanup:old-deals  # dry-run expiry cleanup (add -- --write to apply)
```

### Tests
```bash
npm run test:monitor   # monitor/feed/ranking logic
npm run test:stack     # deal-stacking calculations
npm run test:admin     # admin rate-limit & DB-fallback logic
npm run lint           # ESLint
npm run build          # production build
npm run smoke          # read-only route/SEO/security-header smoke test
npm run smoke -- --strict-content --base-url=https://<prod-domain>  # + banned public trust markers (opt-in)
```

---

## Deployment

Hosted on **Vercel (Hobby plan)**. One cron job per day is the Hobby plan maximum — `vercel.json` keeps the schedule at daily (`0 2 * * *`).

For more frequent feed checks, an **optional external scheduler** (e.g. cron-job.org) can call `GET /api/cron/monitor-feeds` with `Authorization: Bearer $CRON_SECRET` up to every 3 hours. Both paths obey identical safety gates. See [docs/ozbargain-monitoring.md](docs/ozbargain-monitoring.md).

### Required Vercel environment variables
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service-role key |
| `CRON_SECRET` | Bearer token for the cron route |
| `OZB_MONITOR_ENABLED` | Set `true` to activate feed monitoring |

---

## Manual Operations Checklist

Before going live:
- [ ] Apply all Supabase migrations (`supabase db push` or via Dashboard)
- [ ] Set all env vars in Vercel project settings
- [ ] Add a compliance review row via the admin compliance page
- [ ] Enable `OZB_MONITOR_ENABLED=true` in Vercel env if feed monitoring is wanted
- [ ] Optionally configure cron-job.org to call the monitor route every 3 hours
- [ ] Review any staged feed items in `/admin/signals/queue` before publishing
