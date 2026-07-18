# Contributing to DealStack AU

Thanks for your interest in contributing! This document explains how to get set up, what the project's guardrails are, and how to submit changes.

## Getting started

1. Fork and clone the repository.
2. Follow the [Local Setup](README.md#local-setup) instructions in the README (Node 20+, a Supabase project with migrations applied, `.env.local` filled in).
3. Run the dev server with `npm run dev` and the test suites listed below.

## Development workflow

- Open an issue first for anything non-trivial so the approach can be discussed before you invest time.
- Keep pull requests small and focused — one logical change per PR.
- Use Australian spelling in user-facing copy (colour, favour, organisation) and AUD formatting for currency.
- Preserve the existing soft-emerald visual style; don't redesign pages as a side effect of another change.

## Before you open a pull request

All of these must pass locally:

```bash
npm run lint           # ESLint
npm run build          # production build
npm run test:monitor   # if you touched monitor/feed/top-deals/ranking logic
npm run test:stack     # if you touched stack/calculation logic
npm run test:deals     # if you touched deal discovery/URL state/query logic
npm run test:admin     # if you touched admin rate-limit/fallback logic
npm run test:giftcards # if you touched the gift-card pipeline
```

`npm run validate:all` runs the full gate (lint + typecheck + all Vitest suites + build) in one command.

CI runs on every push and pull request; a green build is required before review.

## Project guardrails

These are hard constraints — PRs that violate them will not be merged:

- **No HTML scraping.** External data comes from RSS/Atom feeds only, parsed with `fast-xml-parser`. Never bypass robots.txt, Cloudflare, login pages, or rate limits.
- **Human review is mandatory.** All external feed data (OzBargain signals, offer changes, gift-card candidates) must be staged and approved by an admin before anything is published. Do not add auto-publish, auto-import, or auto-apply paths.
- **Secrets stay server-side.** The Supabase service-role key is only used inside `lib/admin/repos/` and secret-gated API routes — never in client components or public routes. Never commit `.env` values.
- **Cron limits.** The Vercel Hobby plan allows one cron per day; do not change the `vercel.json` schedule to sub-daily.
- **Database changes.** Migrations must be reviewed before they are applied to production, and RLS/security policies are not changed without prior discussion.

## Reporting bugs and requesting features

Use [GitHub Issues](../../issues). For security vulnerabilities, **do not open a public issue** — follow the process in [SECURITY.md](SECURITY.md) instead.

## Code of conduct

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).
