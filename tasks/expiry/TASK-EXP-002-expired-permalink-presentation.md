# TASK-EXP-002 — Verify and harden the expired-deal permalink experience

## Status
Planned

## Priority
P2

## Workstream
EXP — expiry & freshness honesty

## Problem statement
Expired deal permalinks deliberately keep rendering for inbound links — `app/sitemap.ts` comments: "expired permalinks still render for inbound links, but we do not advertise them." That is the right SEO/trust call **only if** the rendered page makes expiry unmistakable: expired status adjacent to the price/saving, no copy-the-code affordance presented as live, and a route to current alternatives.

This session did not visually verify that presentation. Components exist (`DealStatusBadge`, `components/deals/DealMeta.tsx`, `DealFreshness`) but whether the expired path uses them prominently on `/deals/[slug]` (and `/deals/signal/[id]`), in both static and DB modes, is unproven. There is also no e2e case pinning it.

Classification: Requires verification (first step is to prove or disprove; the hardening scope below applies only where the check fails).

## User impact
A shopper landing from Google/OzBargain onto a lapsed deal that still *looks* live is the classic trust-killer this product exists to avoid — and the primary "misleading current offer" risk rated P0 in the priority model if it turns out to be presented as current.

## Evidence
- `app/sitemap.ts` comment (live deals only advertised; expired permalinks render).
- `lib/repos/weeklyDeals.ts` is expiry-filtered for listings; the permalink loader must therefore have a separate not-filtered path — confirm which loader `/deals/[slug]` uses for out-of-window slugs and what state flag it passes to the view.
- `components/deals/DealStatusBadge.tsx` exists; usage sites unverified.
- `tests/e2e/public-flows.spec.ts` has no expired-permalink case (route list inspected).

## Root cause or likely cause
If a gap exists: the permalink path predates the status-badge work, or the expired state renders only in metadata rather than beside price/CTA.

## Scope
1. **Verify:** with a controlled fixture (static mode: temporarily date a static weekly deal in the past, or use a test-only fixture), load the expired permalink and record what renders: badge placement, price presentation, code visibility, alternatives links, HTTP status and metadata (`robots`/canonical).
2. **Harden where failing:** ensure — expired badge within the same visual block as price/saving; coupon code de-emphasised or hidden behind "expired" state; a "current deals at {store}" link; page metadata marks the state honestly (title suffix "(expired)" is acceptable; do not `noindex` without recording the SEO decision).
3. **Pin:** one e2e case with a dated fixture asserting badge presence and absence of a live-looking CTA; unit test for the state derivation.

## Out of scope
- Archival/deletion policy (write-side; lifecycle owns it).
- Gift-card detail expired states (gift-card RLS hides expired at read; `/gift-cards/history` is the archive surface — different model).
- Sitemap changes (TASK-SEO-002).

## Relevant files
- `app/deals/[slug]/page.tsx`, `app/deals/signal/[id]/page.tsx`
- `lib/deals/load.ts` / `lib/repos/weeklyDeals.ts` (loader split)
- `components/deals/DealStatusBadge.tsx`, `DealMeta.tsx`, `DealFreshness.tsx`
- `tests/e2e/public-flows.spec.ts`, `tests/deals/`

## Data and schema considerations
None; read paths only.

## Security considerations
None.

## Implementation plan
Verification first (step 1) — if the presentation is already correct, convert the findings into the pinning tests (step 3) and close; otherwise implement step 2 minimally.

## Required tests
- Unit: deal state derivation for `expiry_date < todayAU()` on the permalink path.
- e2e: expired permalink shows the expired badge near the price and no copyable live code (fixture-dated; anchor dates the way `c00d1a1` anchors static sample dates so it survives real time).

## Validation commands
```bash
npm run lint && npx tsc --noEmit && npm run test:deals && npm run build && npm run test:e2e
```

## Manual verification
One visual pass of the expired permalink at mobile width (390px) — screenshot in the report.

## Production safety
Read-path presentation only; no data change; no production interaction (verification uses local static fixtures).

## Dependencies
None.

## Parallelisation notes
Touches `/deals/[slug]` view only; conflicts with nothing in this programme.

## Rollback or recovery
Revert commit.

## Acceptance criteria
- Written verification record (in the PR/report) of the before-state with screenshots.
- Expired permalinks: unmistakable expired state adjacent to price, no live CTA, alternatives link — proven by the new e2e test.
- No change to live-deal presentation (existing e2e green).

## Definition of done
Criteria met; report states explicitly whether this was "already correct — tests added" or "fixed — diff attached".

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this entire task file and the referenced pages/components/loaders.
2. FIRST verify the current expired-permalink rendering with a local dated fixture; capture what you find. If presentation is already correct, skip the hardening and only add the pinning tests — report it that way honestly.
3. Check `git status`; preserve unrelated work.

During implementation:
- Smallest complete change; do not redesign the deal page; keep static and DB modes consistent.
- Anchor any fixture dates relative to "today" so tests survive real time.
- Do not commit, push, migrate, deploy, or touch production data.

After implementation:
- Run: `npm run lint && npx tsc --noEmit && npm run test:deals && npm run build && npm run test:e2e`.
- Report the verification record, changed files, test results, and remaining risks.
