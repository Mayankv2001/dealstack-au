# Performance Audit

> Audit date: 2026-07-19 · HEAD `9b7365f` · Code-level review only. No profiling, bundle analysis, or production measurement was run in this session — every item below that needs numbers is routed into TASK-PERF-001 rather than asserted.

## Architecture posture (good by construction)

- **Server-first:** public pages are server components with small client islands (`app/page.tsx` docblock; `components/home/*`). Admin code is under separate route groups, so admin-only dependencies do not leak into public bundles by import structure (spot-checked imports of public pages: repos/engines only).
- **Caching:** homepage and `/deals` use ISR (`revalidate = 300`); health/cron routes are `force-dynamic` with `no-store` — correct split. Gift-card lifecycle explicitly revalidates affected paths after transitions, including on zero-transition retries (cache-eviction crash-safety, `app/api/cron/gift-card-lifecycle/route.ts:302-305`).
- **Dependencies are lean:** no moment/lodash/chart libs; dates via `Intl`; `fast-xml-parser` is the only parser; UI is Tailwind + radix + lucide.
- **Pure engines:** ranking/stacking are in-process over bounded pools (tens of stores/offers), not N+1 DB loops; page loads batch with `Promise.all` (`app/page.tsx:46-55`).

## Findings (all require measurement before optimisation)

### PERF-F1 — No performance baseline or budget exists *(Enhancement → TASK-PERF-001)*
Nothing records first-load JS per route, Supabase query counts per page render, or LCP on mobile. Before any optimisation work, capture: `next build` route table (already produced in CI logs but not tracked), query counts from repo call sites per page, and a Lighthouse/PageSpeed run on `/`, `/deals`, `/gift-cards`, `/search`. TASK-PERF-001 defines the harness and budgets; only findings from it should spawn optimisation tasks.

### PERF-F2 — Composite index for the public gift-card listing *(Ticketed DS-087)*
The public listing read path filters status+review+date ordering; DS-087 already specifies the index. Not duplicated; DB audit notes it as the only known index candidate.

### PERF-F3 — Large server components *(Watch, no task)*
`app/deals/page.tsx` (750 lines) and `app/search/page.tsx` (619) are big but server-rendered; cost is maintainability more than runtime. Splitting is only worth doing alongside a functional change (e.g. TASK-SEARCH-002).

### PERF-F4 — Third-party scripts *(Verified minimal)*
Only `@vercel/analytics` (+ `instrumentation-client.ts` error reporting). No fonts loaded from external hosts (CSP `font-src 'self' data:` corroborates).

## Non-goals

Do not micro-optimise the pure engines (already fast, pure, and fully tested) and do not add client-side data fetching to "speed up" pages — the server-first model is the performance strategy.
