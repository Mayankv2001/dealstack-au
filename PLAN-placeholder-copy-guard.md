# PLAN: Placeholder-copy guard — flag published rows still carrying "Illustrative" demo text

> **Rank: 1 of 5 — do this first.** The public `/cards` page currently serves
> 5 published `card_offers` rows whose `offer_summary` literally begins
> "Illustrative sign-up bonus: …" with `expiry_date = null` (published by the
> admin 2026-07-08; recorded in PROJECT_STATE.md §7 as "intentional placeholder
> state, revisit before treating as real"). FINAL-LAUNCH-CHECKLIST.md §11 has
> an unchecked launch item: *"No placeholder / 'Illustrative' copy remains on
> published rows."* Nothing in the codebase can currently detect this state:
> the admin data-quality report (`getDataQualityReport`) checks expiry, source
> URLs and staleness but never scans text, and the cleanup script only looks at
> dates. This plan adds a read-only, high-severity "Placeholder copy" check to
> both surfaces so the bad state is impossible to miss and cannot silently
> recur. **It does not edit any offer data** — replacing the placeholder rows
> with verified real offers stays a human admin task, done through
> `/admin/card-offers` after this ships (CLAUDE.md: no offer updates without
> admin review).

## Prerequisites

- `nvm use 20` (shell defaults to Node 15 — tests/build/lint fail on it).
- Read `AGENTS.md` — this repo is Next.js 16 with breaking changes; read
  `node_modules/next/dist/docs/` before writing framework code (this plan
  needs almost none).
- Read fully before coding:
  - `lib/admin/repos/dashboard.ts` — the whole "Data quality report" section
    (from `// ── Data quality report` to end of file). Your new check slots
    into the existing `consider()` classification, `DataQualityIssueCode`
    union, and `DataQualityCounts`.
  - `app/admin/(protected)/dashboard/page.tsx` lines 78–125 — `DQ_ISSUE_INFO`
    and `DQ_TILE_ORDER` are `Record`s keyed by `DataQualityIssueCode`; adding
    a code without adding entries there is a **compile error** (deliberate —
    the compiler walks you to every display site).
  - `scripts/cleanup-old-deals.ts` — especially `flagPublishedNoExpiry()`
    (the report-only pattern you will copy) and the header comment's safety
    rules (never delete, report-only sections never write).

## Goal

A published offer row containing placeholder/demo wording is surfaced as a
**high-severity** data-quality flag on `/admin/dashboard` (with a count tile
and per-row issue chip) and as a report-only section in
`npm run cleanup:old-deals` output. Zero writes anywhere. After the admin then
fixes the 5 card-offer rows by hand, the flag count drops to 0 and stays 0
unless placeholder copy is ever published again.

## Exact files to touch

| File | Change |
|---|---|
| `lib/admin/placeholderCopy.ts` | **New** — pure, dependency-free marker scanner |
| `lib/admin/repos/dashboard.ts` | Add `placeholder-copy` issue code + scan text columns |
| `app/admin/(protected)/dashboard/page.tsx` | Add `DQ_ISSUE_INFO` + `DQ_TILE_ORDER` entries |
| `scripts/cleanup-old-deals.ts` | Add report-only placeholder section |
| `tests/admin/placeholderCopy.test.ts` | **New** — pure-function tests |
| `FINAL-LAUNCH-CHECKLIST.md` | §11: note the check is now automated on the dashboard |

No migrations. No RLS changes. No public UI changes. No writes to any table.

## Step-by-step implementation order

### Step 1 — `lib/admin/placeholderCopy.ts` (pure, no imports)

```ts
/** Case-insensitive, word-bounded markers of demo/placeholder copy. Deliberately
 *  high-precision: every hit is a human review cost, so no bare "sample"/"example"
 *  (those appear in legitimate offer text, e.g. "free sample", "for example"). */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\billustrative\b/i,
  /\bplaceholder\b/i,
  /\blorem\b/i,
  /\bsample (data|figures?|offer|only)\b/i,
  /\bdemo (data|only|offer|row)\b/i,
  /\bexample only\b/i,
];

/** Returns the distinct matched marker snippets (empty array = clean). */
export function findPlaceholderMarkers(
  texts: ReadonlyArray<string | null | undefined>
): string[]
```

Implementation: join non-empty inputs with `"\n"`, run every pattern, collect
`match[0]` lowercased, dedupe, return sorted (sorted output makes tests and
labels deterministic). Keep this file free of any import — it is shared by a
server repo AND a CLI script, and must never drag `getSupabaseAdmin` (which
has a browser guard) into the script bundle.

### Step 2 — extend the data-quality report (`lib/admin/repos/dashboard.ts`)

1. Add `"placeholder-copy"` to the `DataQualityIssueCode` union and
   `placeholderCopy: number` to `DataQualityCounts` (initialise to 0 in
   `getDataQualityReport`).
2. **Widen the SELECTs** — the current queries do not fetch any text columns,
   so without this the scan silently sees `undefined` and flags nothing:
   - `cashback_offers`: add `terms_summary`
   - `gift_card_offers`: add `usage_notes, stack_notes` (both are `text[]`)
   - `points_offers`: add `earn_rate_display`
   - `card_offers`: add `offer_summary, eligibility_notes`
   - `weekly_deals`: add `summary` (already selects `title`)
   Add the new fields to the corresponding `*DqRow` interfaces.
3. Extend `consider()` with an optional `placeholderTexts?: (string | null)[]`
   param. When provided and `findPlaceholderMarkers(placeholderTexts)` is
   non-empty: increment `counts.placeholderCopy`, push
   `{ code: "placeholder-copy", label: `Placeholder copy: "${markers.join('", "')}"` }`,
   and set `severity = "high"` (assign before the expired check's
   `severity = "high"` or simply set it unconditionally — "high" can never be
   downgraded by later checks in the current code, but keep the existing
   "first high wins" style: set it the same way `expired` does).
4. Pass texts per table:
   - cashback → `[r.terms_summary]`
   - gift cards → `[...r.usage_notes, ...r.stack_notes]` (spread the arrays;
     they are `text[]`, not strings)
   - points → `[r.earn_rate_display]`
   - card offers → `[r.offer_summary, r.eligibility_notes, r.card_name]`
   - weekly deals: the weekly-deals loop does not use `consider()` — leave it
     alone in v1 EXCEPT: also scan `[r.title, r.summary]` and, on a hit, push
     a flag the same way its `stale-week-of` block does (severity `"high"`,
     issues `[{ code: "placeholder-copy", … }]`).
   - signals: **deliberately excluded.** Sample signals are marked by the
     structured `ozbargain_signals.is_sample` column and are rendered with an
     explicit "Sample signal —" label everywhere public
     (`lib/repos/sourceResults.ts:259`); the launch checklist explicitly
     allows "clearly labelled samples". Text-sniffing them would only make
     noise. Write this as a comment at the exclusion site.

### Step 3 — dashboard display (`app/admin/(protected)/dashboard/page.tsx`)

Add to `DQ_ISSUE_INFO`:

```ts
"placeholder-copy": {
  label: "Placeholder copy",
  explanation:
    "Published row still contains demo/illustrative wording — replace it with verified real offer details before relying on it.",
  tone: "border-destructive/30 bg-destructive/10 text-destructive",
},
```

Add to `DQ_TILE_ORDER` (first, before `expired` — it is the most actionable):
`{ code: "placeholder-copy", count: (c) => c.placeholderCopy }`.

TypeScript enforces both — build fails until they exist.

### Step 4 — cleanup script report section (`scripts/cleanup-old-deals.ts`)

Add `flagPlaceholderCopy()` modelled exactly on `flagPublishedNoExpiry()`:
select `*` from each of `cashback_offers`, `gift_card_offers`,
`points_offers`, `card_offers`, `weekly_deals` where `is_published = true`,
run `findPlaceholderMarkers` over the same fields as Step 2 (the script
selects `*`, so all columns are present — but remember `usage_notes` /
`stack_notes` arrive as arrays), and print a `⚑ REPORT-ONLY` section per
table. Import with a relative path: `import { findPlaceholderMarkers } from
"../lib/admin/placeholderCopy";` (matches the existing `"../lib/env"`
import). Call it in `main()` next to the other `flagPublishedNoExpiry` calls.
**It must not write anything and must not add to `totalCandidates`** — it is
informational, like the no-expiry flags. Update the script's header comment
to mention the new report section.

### Step 5 — tests (`tests/admin/placeholderCopy.test.ts`)

Table-driven over `findPlaceholderMarkers`:
- `["Illustrative sign-up bonus: bonus Qantas Points…"]` → `["illustrative"]`
  (the literal prod text — pin it).
- Case-insensitivity: `"ILLUSTRATIVE example"` → hit.
- `["placeholder URL"]` → hit; `["lorem ipsum dolor"]` → hit.
- **Negative cases (precision):** `"Free sample with every order"` → `[]`;
  `"for example, stack with gift cards"` → `[]`; `"Sample the range in
  store"` → `[]`; `"5.5% off Ultimate Gift Cards"` → `[]`; empty array → `[]`;
  `[null, undefined, ""]` → `[]`.
- Multiple inputs, one dirty: `["clean text", "sample data set"]` → hit.
- Dedupe: `"illustrative … illustrative"` → one entry.

### Step 6 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:admin        # new tests live in tests/admin
npm run test:monitor && npm run test:stack   # confirm no collateral
npm run cleanup:old-deals # dry-run: the 5 card offers appear in the new ⚑ section
```

Then tick/annotate FINAL-LAUNCH-CHECKLIST.md §11 ("automated: 'Placeholder
copy' tile on /admin/dashboard must read 0") and update PROJECT_STATE.md per
its own §12 instructions when committing.

## Edge cases a weaker model would miss

1. **The DQ queries don't currently select any text columns.** If you skip the
   SELECT widening (Step 2.2) everything type-checks via the `as unknown as`
   casts, the scan sees `undefined`, and the feature silently detects nothing.
   Verify detection end-to-end against the real DB (or a seeded local row)
   before calling it done.
2. **`usage_notes` / `stack_notes` are `text[]` columns.** Joining a raw array
   into a single string with `String(arr)` inserts commas but works by
   accident; spread them as separate entries instead — the helper accepts an
   array of strings for exactly this reason.
3. **Precision beats recall.** Bare `\bsample\b` or `\bexample\b` will flag
   legitimate offer copy ("free sample", "for example"). The pattern list in
   Step 1 is the whole point of this plan — don't "improve" it by loosening.
   Every false positive erodes trust in the dashboard.
4. **Signals are excluded by design, not by omission** — `is_sample` is a
   structured column and sample signals are intentionally public with a
   "Sample signal" label. Flagging them would tell the admin to "fix" rows
   that are correct.
5. **`DQ_ISSUE_INFO` / `DQ_TILE_ORDER` are exhaustively typed.** If the build
   fails after adding the issue code, that is the type system pointing you at
   the dashboard page — add the entries, don't weaken the types.
6. **Do not auto-unpublish placeholder rows** in the cleanup script, even
   though `unpublishExpired` looks like a tempting template. The 5 card
   offers are the entire content of the live `/cards` page; auto-unpublishing
   would blank a public page with no admin review. Report-only.
7. **Keep `lib/admin/placeholderCopy.ts` import-free.** Importing anything
   from `lib/admin/repos/*` pulls `getSupabaseAdmin` (browser-guarded,
   env-dependent) into the tsx script and into vitest, which will fail in CI
   without env vars.
8. **The fix for the flagged rows is manual and out of scope.** After this
   ships, the admin edits each card offer via `/admin/card-offers/<id>/edit`
   against the bank's own public page: real `offer_summary`, real
   `eligibility_notes`, real `expiry_date` (or confirmed evergreen),
   `confidence = "confirmed"`. The edit path already bumps `last_checked_at`
   (`lib/admin/repos/cardOffers.ts:145`) and revalidates `/cards`. Do not
   script these edits.

## Acceptance criteria

- [ ] `npm run test:admin` passes with the new `placeholderCopy.test.ts`,
      including all negative-precision cases.
- [ ] `/admin/dashboard` shows a "Placeholder copy" tile; against current prod
      data it reads **5**, and each of the 5 card-offer rows appears in the
      flagged list with severity high, chip text quoting the matched marker,
      and an edit link to `/admin/card-offers/<id>/edit`.
- [ ] `npm run cleanup:old-deals` (dry-run) prints a `⚑` placeholder section
      listing the same 5 rows and exits without writing (row counts in DB
      unchanged; `candidates found` total unchanged vs. before this plan).
- [ ] A published row with clean copy produces no placeholder flag; an
      unpublished/draft row with placeholder copy produces no flag (only
      published rows are scanned — same scope the report already uses).
- [ ] `git diff --stat` touches only the six files listed above.
- [ ] `npm run lint`, `npm run build`, `test:admin`, `test:monitor`,
      `test:stack` all pass on Node 20.
- [ ] Zero writes: the diff contains no `.update(`, `.insert(`, `.upsert(` or
      `.delete(` calls in any file this plan touches (report/flag code only).
