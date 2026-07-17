# Gift-Card Intelligence Pipeline (GCDB-style sources)

> **⚠️ Automated fetching only runs behind a quadruple gate, and nothing raw or
> unreviewed ever reaches the public site.**
>
> Like the OzBargain monitor, this pipeline stays **off by default** and stages
> everything for admin review. It adds the *sourcing* side of gift-card offers;
> the approved public surface is still the existing `gift_card_offers` table
> (RLS `is_published`), which the stack engine and the public `/gift-cards` page
> already consume. The only path into that table is the reviewed approve RPC.

Migration: `supabase/migrations/021_gift_card_pipeline.sql`
(**applied to production 2026-07-12** via the Supabase MCP after admin review;
types regenerated the same day, commit `b541521`).

---

## The trust boundary

```
External source (GCDB RSS)
  → raw source snapshot        gift_card_raw_items    (service-role only)
  → parsed candidate           gift_card_offer_candidates (service-role only)
  → normalised internal offer  (editable extraction fields on the candidate)
  → compatibility analysis     compatibility_json / change classification
  → admin review               /admin/gift-cards/review  (human gate)
  → approved public offer      gift_card_offers (RLS is_published = true)
```

Every arrow before "admin review" is service-role-only and default-deny under
RLS. **Nothing auto-publishes.** A material change to an already-approved offer
never rewrites the public row — it only stages a `changed` candidate for
re-review.

---

## Modules

Pure, offline-testable logic lives in `lib/giftcards/` (unit tests in
`tests/giftcards/`, run with `npm run test:giftcards`):

| Module | Responsibility |
| --- | --- |
| `parseGcdbFeed.ts` | Parse GCDB WordPress RSS 2.0 → structured facts + a bounded ≤280-char excerpt. Never keeps article bodies, images or comments. |
| `extractOffer.ts` | One parsed item → normalised offer fields with a 0–1 confidence and explicit warnings. Unknowns stay null; never invents rates/dates/programmes. |
| `value.ts` | The single place the valuation formulas live (bonus-value, points, acquisition cost). Shared by the offer card, admin preview and stack engine so every surface shows identical numbers. |
| `classifyChange.ts` | Diffs two extractions of the same source item → cosmetic / non-material / material / expiry-extension / eligibility / stacking-condition / source-removed, and whether it forces re-review. |
| `runIngest.ts` | Dependency-injected orchestrator (clock, fetch, repo). Idempotent: dedupe on external id, unchanged content only bumps `last_seen`, changed content re-stages a candidate. No I/O of its own. |
| `schedule.ts` | Australia/Sydney, DST-safe run-hour + interval guards (pure Intl, no fixed offset). |
| `publicQuery.ts` | URL-state → tab/filter/sort over the already-approved public offers. Powers `/gift-cards`. |

Service-role data access is `lib/admin/repos/giftCardPipeline.ts`; the networked
fetch + gating is the cron route `app/api/cron/gift-card-ingest/route.ts`.

---

## The four gates (all must be open before one outbound request)

1. **`CRON_SECRET` bearer** — the route rejects unauthenticated calls
   (timing-safe compare), shared with the other cron triggers.
2. **`GCDB_INGEST_ENABLED=true`** — env master switch, defaults off. When off the
   route does no DB read and no network.
3. **`gift_card_sources.enabled = true`** — the DB source row, seeded disabled.
4. **`gift_card_sources.automated_fetch_allowed = true`** — the recorded
   robots/terms permission for automated fetching, seeded disabled.

`GCDB_REQUEST_USER_AGENT` is **required** when enabled — an identifying UA with a
contact URL, never a spoofed browser string. The host allowlist
(`lib/security/urlPolicy.ts`) restricts fetching to `gcdb.com.au`. A Cloudflare /
login / non-XML body is reported as `blocked` and the run stops — the fetcher
never bypasses a challenge, never follows item links, never opens HTML.

---

## Schedule

An external scheduler (`.github/workflows/gift-card-ingest.yml`) fires **daily**
at both UTC equivalents of 7:00 AM Australia/Sydney (20:00 UTC AEDT, 21:00 UTC
AEST). The route decides whether to run:

- it must currently be the 7 o'clock hour in Australia/Sydney, **and**
- the last non-skipped run started **≥ 40 hours** ago (`RUN_INTERVAL_GUARD_HOURS`
  — "every other day" with jitter tolerance).

Off-hour and duplicate invocations return a safe machine-readable skip, and a
unique partial index enforces **one running ingest at a time**. `?force=1` lets
an admin bypass the run-hour gate (but not the interval guard) for a manual run.

This is separate from the Vercel Hobby daily cron and the OzBargain monitor.

---

## What is stored (and what is not)

`gift_card_raw_items.raw_payload` holds the **structured** extracted fields
(`offer_type` / `offer_store` / brands / dates) plus the bounded factual excerpt
— **not** the raw article body, images or comment content. The reviewing admin's
edited values are authoritative on approval; the parser output is only a
suggestion. `gift_card_knowledge` is an internal reference ledger and is never
copied to a public surface.

---

## Approval

`approve_gift_card_candidate(candidate_id, offer_id, offer_jsonb, reviewer)` is a
`security definer` RPC granted to `service_role` only. In one transaction it
guards the candidate state, upserts the (public-gated) `gift_card_offers` row
from the **admin-reviewed** values, links the candidate, and writes the audit
row. It never reads the raw payload directly.

The forward-only `033_gift_card_offer_approval_hardening.sql` design makes the
canonical identity part of that boundary: a changed candidate can update only
its linked offer, while a new candidate cannot claim an ID owned by unrelated
source/raw-item/sub-offer lineage. Publication requires confirmed evidence and
a current Sydney date window. A reviewed future offer remains private in
`approved-future` until the 032 lifecycle RPC activates it; expired candidates
are rejected. Exact retries return the existing link without another write.
Public RLS independently requires confirmed, active, in-window state.

---

## Public valuation disclosure

The `/gift-cards` page shows one **effective saving** figure per offer, from
`lib/giftcards/value.ts`:

- **Discounts** show as-is.
- **Bonus value** — "10% bonus value" → `10 / (100 + 10) = 9.09%` effective
  against the net cost.
- **Points** — valued at a disclosed cents-per-point rate (default 0.5c for
  Everyday Rewards / Flybuys, 1c for Qantas / Velocity; overridable per offer).
  Points are **never** presented as guaranteed cash — cash paid and reward value
  are shown separately everywhere.

---

## Operating the pipeline

For future schema changes, start with the local, non-networked rollout
checklist:

```bash
npm run migration:rollout -- --migration 023_example.sql --phase dry-run
```

The tool refuses a dirty tree by default, captures a read-only before hash,
requires an interactive migration-specific approval phrase, and performs the
post-apply schema probe/type regeneration/manifest tests. It deliberately does
not run bulk `supabase db push`. The remote ledger was canonicalised through
032 on 2026-07-17, and 033 remains separately gated.

1. Apply migration `021` to production (review first) and regenerate
   `lib/supabase/database.types.ts` via `npm run types:gen`. Until then the
   pipeline repo reaches the new tables through a documented loosely-typed client
   bridge (see the header comment in `giftCardPipeline.ts`).
2. Confirm robots/terms for the source and record the timestamps on the
   `gift_card_sources` row.
3. Set `GCDB_INGEST_ENABLED=true` and `GCDB_REQUEST_USER_AGENT` in Vercel.
4. Enable the source row (`enabled` + `automated_fetch_allowed`).
5. Watch the first runs in `gift_card_ingest_runs`; review staged candidates at
   `/admin/gift-cards/review`. **Approve** is the only publication step.

---

## Offer detail experience (migration 022)

The public `/gift-cards/[id]` page answers the eight buyer questions (what /
how to claim / which cards / where they work / MCC restrictions / limits /
stackability / what to verify) from **structured fields only** — the page
composes pure models in `lib/giftcards/` and never touches raw source
payloads (`tests/giftcards/noSourceProse.test.ts` enforces this with a
property-access trap):

- `claimSteps.ts` — original numbered claim flow; steps appear only when the
  data behind them exists.
- `termsRows.ts` — structured terms table (promo code, exact expiry
  time+timezone, caps, formats, shipping, geography, combinability, official
  terms link) with explicit "not recorded" fallbacks.
- `stackability.ts` — two-stage analysis (acquisition vs redemption) using
  the same five-status vocabulary as `compatibility.ts`.
- `acceptanceModel.ts` — per-product acceptance views (merchants, categories,
  supported/unsupported MCCs, confidence tiers) with the mandatory
  "acceptance depends on the MCC" disclaimer.
- `value.ts#buildWorkedExample` — face-value worked example; cash savings and
  points/bonus estimates are kept strictly separate.

Migration `022_gift_card_offer_detail.sql` (additive) adds the offer columns
behind these sections plus `gift_card_products.unsupported_mccs`, and extends
the approve RPC. It was **applied to production on 2026-07-12** and
`database.types.ts` regenerated from the live schema; the repos still map every
column defensively (missing → null) so the demo fallback and any pre-022
environment degrade to their honest fallback. Candidate review at
`/admin/gift-cards/review` captures the new fields and **blocks approval**
without seller, promotion value, source URL and an expiry date (or an
explicit "ongoing" tick).
