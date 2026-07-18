# DealStack AU — Roadmap

This is the public, narrative view of where the project is heading. The
engineering source of truth — a full ticketed backlog with dependencies,
validation gates, and human-approval points — lives in
[docs/backlog/](docs/backlog/), particularly
[RELEASE-ROADMAP.md](docs/backlog/RELEASE-ROADMAP.md) and
[DEALSTACK-BACKLOG.md](docs/backlog/DEALSTACK-BACKLOG.md).

Guiding principle throughout: **nothing external is ever auto-published.**
Every stage below keeps the mandatory admin-review gate between ingested data
and the public site.

## Shipped

- Public site: homepage, deal discovery with URL-backed filters, store pages, live cross-entity search, and a bank/card offers comparison page
- Deal-stacking calculator combining cashback portals, discounted gift cards, and points programmes
- Admin portal: staged feed queue, offer-change review, gift-card candidate review, card-offer CRUD, audit log, data-quality report, per-admin rate limiting, and a cron health monitor
- Gated OzBargain RSS monitoring (off by default, compliance-review gated, staged-only writes)
- Gift-card ingestion pipeline with duplicate detection, approval validation, and lifecycle/reconciliation jobs
- CI on every push/PR, plus scheduled health and schema-drift checks

## Now — accurate production data (M1)

Make every published row provably true before building anything on top of it.

- Re-verify all published gift-card offers: expiry dates, terms, promo codes, and citations
- Clear the candidate review queue; resolve duplicates
- CI runs every test suite; harden fixtures with real captured feed data
- Persist a reviewed "ongoing offer" state and back it with a database constraint

## Next — richer intelligence and safe automation (M2–M3)

Deepen what an offer *means*, then switch automation on only once it is observably safe.

- Model compound campaigns (one promotion spanning multiple mechanics or sellers) end-to-end: schema, extraction, review UI, and detail pages
- Product-level data: which specific gift cards an offer covers, caps, denominations, and acceptance rules, with worked examples
- Guarantee the stack calculator and detail pages can never disagree about stackability
- Security hardening: RLS assertion probes, shared bearer-token handling, CSP evaluation
- Ingestion hardening and ops visibility: health signals, an expiring-offers digest, a runbook, and an emergency stop
- Activate recurring scheduled ingestion only after the above, with observed healthy runs as the exit criterion

## Later — polish and evidence-gated growth (M4)

- Accessibility pass (axe-gated) and structured-data (JSON-LD) validation
- Mobile UX depth: filter drawer, offer comparison
- A points-programme catalogue (modelled honestly — no fabricated "ongoing" offers)
- Community input: a report-a-problem flow feeding the admin queue
- Research memos on additional data sources and scaling decisions — each requiring an explicit go/no-go decision before any build

## How to influence this

Open a [GitHub Issue](../../issues) or start a
[Discussion](../../discussions). Small, well-scoped proposals that respect the
guardrails in [CONTRIBUTING.md](CONTRIBUTING.md) are the easiest to act on.

*Dates are deliberately absent: milestones exit on evidence (verified data,
green probes, observed healthy runs), not on a calendar.*
