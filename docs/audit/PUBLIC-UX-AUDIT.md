# Public UX Audit

> Audit date: 2026-07-19 · HEAD `9b7365f` · Based on code inspection of `app/(public routes)` + components, and the e2e spec's behavioural assertions. Live production browsing was **not** performed in this session; UI claims below are code-derived, and items needing a visual pass are marked.

## Route surface

Homepage (`app/page.tsx`, ISR 300s) — hero search, featured stack, gift-card offer carousel (`OfferMarquee`, cap 18 slides, ending-soonest, unknown-expiry last), today feed (top 5), savings-layers explainer, calculator. `/deals` (750-line server component: kind/merchant/view filters, ranked). `/search` (619 lines, `q` + `spend` params). `/stores`, `/stores/[slug]`, `/cards(/compare|/[id])`, `/cashback`, `/gift-cards` (9 sub-routes), `/rewards(/[slug])`, `/deals/[slug]`, `/deals/signal/[id]`, policy pages, custom 404 + error + loading states for deals/search.

## Strengths (verified in code)

- **Truthfulness machinery is first-class:** verified-vs-total saving split (`verifiedSaving` only from confirmed non-optional cash layers, `buildStack.ts:874-885`), pay-at-checkout vs cashback-later split (`payAtCheckout = effectivePrice + cashbackLater`), points never subtracted from cash price, optional/action-gated layers never deducted, per-layer citations + worst-confidence roll-up, `sanitisePublicText` scrubbing dev wording as a final gate.
- Expiry/freshness surfaced: urgency labels ("Ends today/tomorrow/in N days"), `DealFreshness`, `ConfidenceBadge`, stale-data and expiry-soon warnings on stack cards.
- Empty states exist on the two main grids: "No deals match those choices" (`app/deals/page.tsx:679`), "No offers match these filters" (`components/GiftCardsClient.tsx:292`).
- Mobile: dedicated Pixel-5 Playwright project; carousel nav recently made engine-reliable (`9b7365f`).
- AUD formatting via `Intl.NumberFormat("en-AU")`; Australian spelling in copy inspected.

## Findings

### UX-F1 — Search zero-hit state exists but offers no recovery *(Verified 2026-07-19; enhancement → TASK-SEARCH-002)*
Correction to the first draft of this audit: `app/search/page.tsx:280-292` DOES render an honest empty state ("No reviewed match yet" card with example suggestions) when every result pool is empty. What is missing is recovery: no close-store-name suggestions, no popular-stores list, no clear-query action, and no unit/e2e test pins the zero-hit path (the e2e spec asserts only happy paths `?q=myer`, `?q=macbook-air-m3`). Since search is every-term-must-match (see SEARCH audit), a single typo lands here often — TASK-SEARCH-002 adds recovery affordances and the missing test; TASK-SEARCH-001 attacks the typo-to-zero-hit funnel itself.

### UX-F2 — Two stacking calculators can disagree *(Design weakness → TASK-STACK-001)*
`DealStackCalculator` uses `lib/calculateStack.ts`, which ignores caps, min-spend, uses-per-customer and denominations that the stack engine honours. A shopper who cross-checks the homepage stack against the calculator can get different numbers for the same store/spend. The honest-output principle demands one maths source or an explicit "simplified estimate" label.

### UX-F3 — Expired permalink presentation *(Requires verification → TASK-EXP-002)*
`app/sitemap.ts` comments that expired deal permalinks "still render for inbound links". Correct SEO behaviour, but the rendered state must scream "expired" (badge near the price, no copyable code, link to live alternatives). `DealStatusBadge` exists; whether the expired path uses it prominently needs a visual check with a dated fixture.

### UX-F4 — Never-checked layers look cleaner than stale ones *(Design weakness → TASK-EXP-001)*
See DATA-QUALITY DQ-F1; the fix is a "not yet verified" warning of at least the same visual weight as stale-data on stack cards.

### UX-F5 — Discoverability of the full gift-card set *(Verified adequate today, watch cap)*
Carousel caps at 18 slides (`MARQUEE_SLIDE_CAP`, `lib/giftcards/marquee.ts:21,91`) with a live count displayed; 13 published offers today, and the grid at `/gift-cards` is uncapped with filters. No task now; if published volume approaches the cap, add a "view all N offers" affordance test.

### UX-F6 — Backlog already owns the remaining UX debt
Mobile filter drawer (DS-069), stale badges on gift-card surfaces (DS-068), honest degraded/empty states for `/gift-cards` (DS-067), cross-seller comparison (DS-070), uncertainty explanations on stack layers (DS-062), review-queue ergonomics (DS-056). Not duplicated.

## Manual visual pass still owed (production, read-only)

1. `/search?q=zzzz` and `/search?q=` (empty) on mobile — UX-F1.
2. An expired `/deals/[slug]` permalink — UX-F3.
3. Homepage carousel with >3 slides on iOS Safari (engine variance was the recent bug).
4. Calculator vs featured-stack number agreement for one store — UX-F2.
