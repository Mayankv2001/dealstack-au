# PLAN: Turn on offer-change detection — the built-but-never-wired half of the monitor

> **STATUS (2026-07-10): SUPERSEDED.** The build this plan describes shipped
> dark in 89c8c26 (pipeline + flag hook) and 8404c27 (preview panel). Do not
> re-execute. Go-live is covered by PLAN-detection-go-live.md.

> **Rank: 9 of 10. Prerequisite: PLAN-feed-ingestion-recovery must be done
> and verified first** (feeds fetching again, `source_type='ozbargain'`).
> The offer-changes feature is 80% built and 0% running: the pure detection
> toolkit exists (`lib/monitor/offerChanges.ts` — candidate building,
> content-hash dedupe, apply planning, all tested), the staging table and
> RLS exist (migration 004), the admin review UI exists
> (`/admin/offer-changes` with claim-first Apply), and the persistence
> function exists (`insertOfferChangeCandidates` in
> `lib/admin/repos/offerChanges.ts:152`). But **nothing invokes detection**:
> grep shows no monitor/cron/script imports `lib/monitor/offerChanges.ts` —
> only the seed script and tests do. In prod, `offer_change_candidates` has
> had 0 rows ever; the admin surface reviews demo seeds or nothing. The
> missing pieces are (a) an extraction step that turns staged feed items
> into `DetectedOffer`s, and (b) a gated, staging-only hook after the
> monitor run. This plan is the explicit phase that authorises that scoped
> monitor-adjacent change.

## Prerequisites

- Plans 1–5 complete AND `PLAN-feed-ingestion-recovery.md` complete (without
  fetching, there is nothing to detect). `PLAN-feed-queue-scalability.md`
  (plan 3) should also be in, since detection shares the queue's growth.
- `nvm use 20`; read `AGENTS.md`.
- Read fully before designing anything:
  - `lib/monitor/offerChanges.ts` — the WHOLE module; your extraction output
    must be `DetectedOffer[]` feeding `buildOfferChangeCandidates` +
    `dedupeOfferChangeCandidates` unchanged
  - `tests/monitor/offerChanges.test.ts` (the contract in test form)
  - `lib/admin/repos/offerChanges.ts` — esp. `insertOfferChangeCandidates`
    (what it expects, what it adds) and `applyOfferChange`'s requirement of
    a resolved `target_id`
  - `scripts/seed-offer-changes.ts` — shows realistic candidate shapes
  - `app/api/cron/monitor-feeds/route.ts` and `scripts/monitor-feeds.ts` —
    the two monitor entry points and their gate/env handling
  - `lib/monitor/feedItemPreference.ts` — the existing keyword-tier style
    your extraction heuristics should imitate (and the memory warning: never
    use bare "grocery"-style always-wins keywords)
  - `lib/sources/normalise.ts` — `findMerchantIdInText`
  - `docs/cashback-portal-policy.md` — which providers are permitted

## Goal

After each monitor run, feed items staged in that run are scanned by pure,
conservative heuristics; high-signal rate/discount changes become
`offer_change_candidates` rows (`review_state='new'`), deduped by content
hash and URL, for the existing human review-and-apply flow. Everything is
behind a new env flag that defaults OFF. **Nothing is ever auto-applied;
this writes only to the staging table.**

## Safety framing (read before coding)

The CLAUDE.md rule is "Do not change monitor gate logic or fetching
behaviour unless a phase explicitly requires it." This plan is that explicit
phase, and it is deliberately narrower than the rule's worst case:
- NO change to fetching, feeds, cadence, gates, or `runMonitor` internals.
- The hook runs strictly AFTER the existing run completes, consumes only
  rows already staged in our own DB, and makes zero network calls.
- New env gate `OZB_OFFER_DETECT_ENABLED` (default off) wraps the entire
  step — fail-closed, additive, independent of the existing gates.
- Writes go ONLY to `offer_change_candidates` with `review_state='new'`.
  The existing admin Apply flow (claim-first conditional update, per Phase 1)
  remains the only path to public data.
- Providers: ShopBack and TopCashback only. **No Cashrewards anywhere**,
  including in detection keywords — a title mentioning Cashrewards must be
  skipped, not staged with a different provider guessed.

## Exact files to touch

| File | Change |
|---|---|
| `lib/monitor/detectOffers.ts` | **New** — pure extraction: feed-item text → `DetectedOffer[]` |
| `lib/monitor/runDetection.ts` | **New** — orchestration (deps-injected, like `runMonitor`) |
| `app/api/cron/monitor-feeds/route.ts` | Post-run hook, env-gated |
| `scripts/monitor-feeds.ts` | Same hook for manual runs, honouring dry-run |
| `lib/admin/repos/offerChanges.ts` | Add `listKnownCandidateKeys()` (hashes + urls) if absent |
| `.env.example` | Document `OZB_OFFER_DETECT_ENABLED` |
| `tests/monitor/detectOffers.test.ts` | **New** — heuristic tests |

No migrations (table exists). No new fetching. No `vercel.json` change.

## Step-by-step implementation order

### Step 1 — `lib/monitor/detectOffers.ts` (pure)

Input: minimal feed-item view `{ rawTitle: string; rawSummary: string; link:
string; categories: string[] }` (match the staged `feed_items` columns).
Output: `DetectedOffer[]` (import the type from `./offerChanges`).

Conservative heuristics — emit a `DetectedOffer` ONLY when ALL hold:
1. A provider/source is explicitly identifiable:
   - `cashback`: title/summary mentions ShopBack or TopCashback (word-bound,
     case-insensitive) AND contains a percentage (`/(\d+(?:\.\d+)?)\s*%/`).
     `sourceName` = the matched provider (canonical casing).
   - `gift_card`: mentions "gift card" AND a percent-off pattern.
     `sourceName` = "OzBargain".
   - `points`: mentions a known program (Qantas, Velocity, Flybuys, Everyday
     Rewards — reuse/borrow the keyword lists in `feedItemPreference.ts`
     rather than inventing new ones) AND an `/(\d+)\s*x/` multiplier.
   - Do NOT emit `promo`-type detections in v1 (stores.discount_percent is
     too noisy to infer from titles) — document this as a non-goal.
2. A merchant resolves: `findMerchantIdInText(rawTitle)` returns an id
   (detection without a merchant can never resolve a target and only creates
   review noise). Set `merchantId`.
3. The numeric value parses via the module's own `parseRateValue`.

Set: `proposedValue` = the matched numeric string with unit (e.g. `"12%"`),
`detectedRateOrDiscount` same, `detectedTitle` = rawTitle, `detectedUrl` =
link, `confidence: "needs-verification"`, `rawSummary` = rawSummary,
`targetId: null` (resolved in Step 2), `previousValue: null` (filled in
Step 2 when a target resolves).

Mentions of Cashrewards anywhere in the text → return no detection for that
item (hard skip), regardless of other matches.

### Step 2 — `lib/monitor/runDetection.ts` (orchestration, deps-injected)

Mirror `runMonitor`'s dependency-injection style so it's testable without a
DB. Signature sketch:

```ts
export interface DetectionPersistence {
  listRecentNewFeedItems(sinceIso: string): Promise<FeedItemView[]>;
  listKnownCandidateKeys(): Promise<{ hashes: string[]; urls: string[] }>;
  resolveCashbackTarget(merchantId: string, provider: string):
    Promise<{ id: string; currentValue: string } | null>;
  resolveGiftCardTarget(...): Promise<...>;   // brand match — see edge case 4
  resolvePointsTarget(...): Promise<...>;
  insertCandidates(rows: OfferChangeCandidateInsert[]): Promise<number>;
}
export async function runDetection(deps, opts: { sinceIso: string; dryRun: boolean }): Promise<DetectionSummary>
```

Flow: load recent `review_state='new'` items (bounded — last 24h AND
`limit(200)`), extract with `detectOffersFromItem`, resolve targets +
`previousValue` where a single unambiguous offer row matches (else leave
`targetId: null` — the admin UI links/skips it), `buildOfferChangeCandidates`
→ `dedupeOfferChangeCandidates(candidates, knownKeys)` → insert (skip when
`dryRun`). Return counts `{ scanned, detected, deduped, inserted }`.

The production `DetectionPersistence` implementation lives with the other
service-role code — follow where the cron route gets its persistence for
`runMonitor` and colocate. `insertCandidates` should call the existing
`insertOfferChangeCandidates` (read what fields it adds — don't duplicate
`review_state` handling).

### Step 3 — wire into the two entry points

1. `app/api/cron/monitor-feeds/route.ts`: after the existing monitor run
   completes successfully, and ONLY when
   `process.env.OZB_OFFER_DETECT_ENABLED === "true"` (add an accessor in
   `lib/env.ts` matching the existing monitor-env accessor style), call
   `runDetection` and append its summary to the route's JSON response.
   Wrap in try/catch: a detection failure must be logged and reported in
   the response but must NEVER fail the monitor run itself.
2. `scripts/monitor-feeds.ts`: same hook, where `--dry-run` maps to
   `opts.dryRun` — dry-run prints what WOULD be staged, inserts nothing.
3. `.env.example`: document the flag (default absent/false; enable only
   after the heuristics have been reviewed via dry-run output).

### Step 4 — tests: `tests/monitor/detectOffers.test.ts`

Table-driven over realistic titles (crib from real OzBargain titles in the
fixtures / seed scripts):
- "15% Cashback at Myer via ShopBack (Max $30)" → cashback, ShopBack,
  merchant myer (if in static stores), 15%.
- "10% off Ultimate Gift Cards @ Coles" → gift_card, 10%.
- "20x Everyday Rewards Points on …" → points, 20x.
- "Bonus Cashback via Cashrewards" → **no detection** (hard skip).
- Percent with no provider → none. Provider with no percent → none.
- Merchant not in stores → none.
- Dedupe: same offer twice in a batch → one candidate; already-known hash or
  URL → dropped (drive `dedupeOfferChangeCandidates` through `runDetection`
  with a fake persistence).
- `runDetection` dry-run inserts nothing but reports counts.

### Step 5 — verify + staged rollout

```bash
nvm use 20
npm run lint && npm run build
npm run test:monitor && npm run test:stack && npm run test:admin
npm run monitor:feeds -- --dry-run   # with OZB_OFFER_DETECT_ENABLED=true in .env.local
```

Review the dry-run detection output by hand. Only after the human owner has
eyeballed a few dry-runs and is happy with precision should
`OZB_OFFER_DETECT_ENABLED=true` be set in Vercel. Candidates then appear in
`/admin/offer-changes` for normal review.

## Edge cases a weaker model would miss

1. **Precision beats recall, by design.** Every false positive is a human
   review cost in `/admin/offer-changes`. Require provider AND value AND
   merchant. Resist adding fuzzy matches; the memory about the OzBargain
   "Groceries" tag (broad categories lie) applies to detection keywords too.
2. **The content hash is the idempotency key across runs.**
   `buildOfferChangeContentHash` hashes source+merchant+url+proposedValue —
   re-detecting the same unchanged offer next run dedupes to nothing, but a
   genuinely new rate at the same URL creates a new candidate. Don't add
   your own timestamp/randomness into any hashed field or idempotency dies.
3. **Known-key dedupe must load hashes AND urls of ALL candidates, not just
   `review_state='new'` ones** — an ignored candidate must stay ignored; if
   you only dedupe against 'new', every ignored item resurrects next run.
   Check what `listOfferChanges` filters by before reusing it; write the
   dedicated `listKnownCandidateKeys()` selecting `content_hash,
   detected_url` across all rows (it's a small table).
4. **Target resolution must be unambiguous or null.** For cashback:
   merchant_id + provider uniquely keys `cashback_offers` in practice —
   verify with a query before assuming; if multiple rows match, set
   `targetId: null` (the Apply flow refuses unresolved targets — that's the
   safe path, `planOfferApplication` returns a skip). Gift cards key on
   brand text, which does NOT reliably equal a merchant name — match against
   `gift_card_offers.brand` case-insensitively and demand a single hit.
5. **`previousValue` comes from OUR row, not the feed text** — it exists so
   the reviewer sees "8% → 12%". When no target resolves, leave it null;
   never parse a "was X%" out of the title.
6. **Detection failure must not poison the monitor.** The cron route's
   monitor result is what the staleness alert (plan 6) watches; a detection
   exception swallowed into the response keeps ingestion healthy and
   observable. Try/catch at the hook boundary, log, continue.
7. **Bound the scan window.** `sinceIso` = last 24h AND a row limit —
   without it, the first enabled run scans the entire 300+ item backlog and
   floods review. If the owner wants a one-off historical sweep, that's the
   dry-run script run by hand, looked at, and only then written.
8. **`runMonitor` itself stays byte-identical.** The hook lives in the two
   entry points AFTER `runMonitor` returns. If you find yourself editing
   `runMonitor.ts`, back out — that's the boundary this plan's safety
   framing promised not to cross.
9. **supabase-js `.in()` / select limits**: `listRecentNewFeedItems` and
   key-loading are single bounded queries — reuse plan 3's `chunk()` if you
   ever pass id lists (you shouldn't need to).
10. **Dry-run parity**: the script's `--dry-run` already gates the monitor's
    write mode (Phase 2, fail-closed compliance gate) — thread the same flag
    into detection rather than inventing a second convention.

## Acceptance criteria

- [ ] With the flag unset: cron route and script behave byte-identically to
      before (diff their JSON/log output on a run) — zero detection code
      executes.
- [ ] `npm run monitor:feeds -- --dry-run` with the flag on prints a
      detection summary and inserts nothing
      (`select count(*) from offer_change_candidates` unchanged).
- [ ] With the flag on (write mode, after human approval of dry-runs):
      candidates appear in `/admin/offer-changes` with provider, merchant,
      detected URL, `needs-verification` confidence, `review_state='new'`;
      re-running immediately inserts 0 (hash/url dedupe); an ignored
      candidate does not resurrect on later runs.
- [ ] A Cashrewards-mentioning fixture produces no candidate (pinned by
      test); `grep -rin cashrewards lib/monitor/detectOffers.ts` appears
      only in the skip logic/comment.
- [ ] Apply flow untouched: applying a resolved candidate still requires the
      admin click and updates exactly the `table.column` the hint showed;
      unresolved-target candidates refuse Apply with the existing message.
- [ ] `runMonitor.ts` has no diff; `vercel.json` has no diff; writes touch
      only `offer_change_candidates`.
- [ ] All suites + lint + build pass (Node 20); new detection tests cover
      every bullet in Step 4.
