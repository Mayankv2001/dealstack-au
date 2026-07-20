# TASK-A11Y-001 — Extend axe coverage to every public template; add keyboard and reduced-motion checks

## Status
Planned

## Priority
P2

## Workstream
A11Y

## Problem statement
Automated accessibility coverage stops at 7 routes. `tests/e2e/public-flows.spec.ts:783-808` runs one axe test (WCAG A/AA tags, failing on serious/critical) over `/`, `/search?q=myer&spend=500`, `/deals?view=popular`, `/cashback`, `/gift-cards`, `/gift-cards/weekly`, `/rewards/everyday-rewards` — in both viewport projects. Unscanned templates the spec already visits elsewhere: `/deals/[slug]`, `/stores/[slug]`, `/gift-cards/[id]`, `/gift-cards/products/[slug]`, `/cards` + `/cards/[id]` + `/cards/compare`, `/gift-cards/where-to-buy`, `/gift-cards/weekly/plan`, zero-hit `/search`, the 404 page, `/admin/login`. There are also no interaction-level checks: nothing tabs through the calculator or deals filters, and the homepage `OfferMarquee` — a moving carousel — has no `prefers-reduced-motion` assertion (WCAG 2.2.2 risk).

Classification: Confirmed gap (coverage counted 2026-07-19); the marquee motion behaviour itself is Requires verification — test it, don't assume it fails.

## User impact
Assistive-technology and motion-sensitive users can hit regressions on detail pages — where purchase decisions actually happen — without any test noticing.

## Evidence
- `tests/e2e/public-flows.spec.ts:783-808` (the loop and its 7 paths).
- Route inventory: `find app -name page.tsx`.
- `docs/audit/ACCESSIBILITY-AUDIT.md` A11Y-F1/F2/F3.
- Backlog: DS-094 (harness — partially delivered), DS-066 (gift-card page a11y fixes — content fixes stay there, not here).

## Root cause or likely cause
The axe loop was seeded with headline routes; nobody extended it as templates grew.

## Scope
- Extend the axe loop to one representative URL per remaining public template (use fixture slugs/ids that exist in static-fallback data — find them the way the earlier spec sections do). Include zero-hit search and 404.
- `/admin/login`: scan the redirect target only if it renders without Supabase env (the spec already documents this constraint at ~line 775); otherwise skip with a comment.
- Add one keyboard-only journey: from `/` hero search, type a store, submit, tab to the primary stack card, assert focus visibility and actionability (Playwright keyboard API; assert `:focus-visible` via evaluated styles or a focus-ring class).
- Add a reduced-motion check: emulate `prefers-reduced-motion: reduce`, load `/`, assert the marquee is not auto-animating (implementation-specific — read `components/*Marquee*`/`lib/giftcards/marquee.ts` first; if the component has no reduced-motion handling, that is a real finding: implement the smallest CSS/JS respect for the preference in the component as part of this task).
- Fix any serious/critical violations the new scans surface **if small** (labels, roles, contrast tokens); larger findings become reported follow-ups, not scope creep.

## Out of scope
- DS-066's content-level gift-card fixes; admin-surface ergonomics (DS-056).
- Non-serious/moderate violations (report, don't chase).

## Relevant files
- `tests/e2e/public-flows.spec.ts`
- `components/` marquee component (reduced-motion, only if needed)
- Any component with a small fixable violation

## Data and schema considerations
None; runs on static-fallback data like the rest of the spec.

## Security considerations
None.

## Implementation plan
1. Enumerate templates vs current scan list; extend the loop.
2. Run; triage violations (fix small, report large).
3. Keyboard journey test; reduced-motion test (+ minimal component change if required).

## Required tests
The additions above; the whole spec green in both projects.

## Validation commands
```bash
npm run lint && npx tsc --noEmit && npm run build
npx playwright test tests/e2e/public-flows.spec.ts
```

## Manual verification
One manual eyeball of badge/emerald contrast tokens (`ConfidenceBadge`, status badges) against the axe results — axe covers computed contrast, but confirm no token relies on images/gradients axe can't judge.

## Production safety
Test-only unless small component fixes are needed; those are presentation-level and covered by the spec.

## Dependencies
None hard. If TASK-SEARCH-002 lands first, its zero-hit URL/test can be shared.

## Parallelisation notes
Heavy editor of `public-flows.spec.ts` — do not run concurrently with TASK-SEARCH-001/002 or TASK-EXP-002 (all touch the same spec); sequence them.

## Rollback or recovery
Revert commit.

## Acceptance criteria
- Axe (serious/critical, A/AA) green across every public template in both viewports; keyboard journey and reduced-motion assertions in place; violations either fixed or individually reported.

## Definition of done
Criteria met; report lists per-route scan results and any deferred findings.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this task, `tests/e2e/public-flows.spec.ts` (structure, fixture-discovery patterns, the axe loop at 783-808), and the marquee component.
2. Re-enumerate public templates (`find app -name page.tsx`) — routes may have changed; verify current axe coverage.
3. Check `git status`; preserve unrelated work.

During implementation:
- Extend the existing loop pattern; keep the serious/critical A/AA bar; fix only small violations inline, report the rest.
- Do not commit, push, migrate, deploy, or scan authenticated admin pages.

After implementation:
- Run lint/typecheck/build and the Playwright spec (both projects).
- Report routes scanned, violations found/fixed/deferred, and whether the marquee needed a reduced-motion change.
