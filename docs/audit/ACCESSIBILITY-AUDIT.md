# Accessibility Audit

> Audit date: 2026-07-19 · HEAD `9b7365f` · Code + test-suite review. No live screen-reader or keyboard session was run; the concrete gaps below are framed as verifiable tasks, not assumed failures.

## Current state

- **Automated coverage exists but is partial:** `tests/e2e/public-flows.spec.ts:783-808` runs one axe test iterating **7 routes** (`/`, `/search?q=myer&spend=500`, `/deals?view=popular`, `/cashback`, `/gift-cards`, `/gift-cards/weekly`, `/rewards/everyday-rewards`) with WCAG A/AA tags, failing on serious/critical, in both viewport projects. (Corrected from this audit's first draft, which under-counted it as "2 scans".) DS-094 is therefore *partially* delivered: the harness and core routes are in; detail templates are not.
- **Semantic foundation:** pages are server-rendered HTML with shadcn/radix primitives (radix supplies keyboard/ARIA behaviour for interactive components); forms are native; there is no div-soup routing.
- **Carousel:** recent fix (`9b7365f`) targeted cross-engine nav reliability for the homepage gift-card carousel; keyboard operability and reduced-motion behaviour of `OfferMarquee` are untested in the suite.
- **Colour contrast:** soft-emerald palette; no contrast audit artefact exists in the repo.
- Backlog: DS-066 (gift-card pages a11y audit+fixes), DS-056 (admin review-queue keyboard ergonomics) remain open and are not duplicated here.

## Findings

### A11Y-F1 — Axe scans cover 7 routes; detail templates are unscanned *(Confirmed gap → TASK-A11Y-001)*
Templates the spec already visits but never scans: `/deals/[slug]`, `/stores/[slug]`, `/gift-cards/[id]`, `/gift-cards/products/[slug]`, `/cards` + `/cards/[id]`, `/gift-cards/where-to-buy`, `/search` with zero hits, `/gift-cards/weekly/plan`, 404, `/admin/login`. Extend the existing loop pattern (`public-flows.spec.ts:783-808`); keep the serious/critical WCAG A/AA bar.

### A11Y-F2 — Interaction-level checks absent *(Design gap, folded into TASK-A11Y-001 + DS-066)*
No test tabs through the calculator, the deals filters, the carousel controls, or the mobile filter UI; no `prefers-reduced-motion` assertion for the marquee (it is a marquee — motion without opt-out is a WCAG 2.2.2 risk). Add: keyboard-only walk of one full search→stack journey; reduced-motion snapshot of the marquee.

### A11Y-F3 — Contrast tokens unverified *(Requires verification, folded into TASK-A11Y-001)*
Axe catches most text-contrast issues once coverage exists (A11Y-F1); badge/emerald-on-white tokens in `ConfidenceBadge`/status badges are the ones to eyeball manually.

## Where the bar is

Axe-clean (A/AA) on every public template in both viewports, keyboard-completable core journey, honest focus states, motion respecting `prefers-reduced-motion`. Admin surfaces follow via DS-056/DS-066.
