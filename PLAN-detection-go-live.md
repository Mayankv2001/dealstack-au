# PLAN-detection-go-live — Take offer-change detection live, with observability

> **Rank: 2 of 5 (2026-07-10 backlog).** Detection is **fully built and fully
> dark**: the pure pipeline (`lib/monitor/detectOffers.ts`,
> `lib/monitor/runDetection.ts`), the cron hook behind
> `OZB_OFFER_DETECT_ENABLED` (`app/api/cron/monitor-feeds/route.ts:162–177`,
> commit `89c8c26`), and the admin "Preview detection (dry run)" panel
> (`app/admin/(protected)/offer-changes/DetectionPreviewClient.tsx`, commit
> `8404c27`) all exist and are tested. Prod ground truth 2026-07-10:
> `offer_change_candidates` has **0 rows ever** — the flag has never been
> flipped. **The old `PLAN-offer-change-detection-live.md` is stale** (it claims
> "nothing invokes detection" — false since `89c8c26`); this plan supersedes it.
> What actually remains: (a) an **ops observability gap** — after go-live the
> only signals are the cron route's JSON (which nobody reads) and rows quietly
> appearing in `/admin/offer-changes`; `/admin/monitor`, the ops page, knows
> nothing about detection — and (b) a written go-live/rollback runbook. The env
> flip itself is a human step; this plan makes it safe and observable.

## Goal

`/admin/monitor` gains a read-only "Offer-change detection" status card (flag
state, candidate counts by review state, when a candidate was last staged, link
to the review + preview surfaces). The go-live and rollback procedure is written
into `docs/ozbargain-monitoring.md` and referenced from
`FINAL-LAUNCH-CHECKLIST.md`. Zero behaviour change to the monitor or detection
themselves.

## Non-goals

- **No change to** `lib/monitor/**`, `app/api/cron/**`, `vercel.json`, gates,
  fetching, or `runDetection` — CLAUDE.md protects monitor logic, and nothing
  here needs it. This plan is render-only + docs.
- No auto-enabling. The flag flip happens in the Vercel dashboard, by the human,
  after the documented precision review.
- No new env vars, migrations, or RLS changes.

## Preconditions

- `git pull --rebase`; clean tree; `nvm use 20`.
- Read fully before coding:
  - `lib/admin/repos/offerChanges.ts` — the whole file; you are adding one
    read-only function here and must reuse its row/state vocabulary. Derive the
    exact `review_state` values from this file plus
    `supabase/migrations/004_offer_change_candidates.sql` — do not guess them.
  - `app/admin/(protected)/monitor/page.tsx` — `MonitorStatusPage` (line 241)
    and its `StatCard`/`CountPill` helpers (lines 56–96); your card copies these
    conventions.
  - `lib/admin/repos/dashboard.ts:44–68` — `countAll`/`countWhere` head:true
    count pattern to copy (counts only, no row data over the wire).
  - `app/admin/(protected)/offer-changes/actions.ts:100–144` — the preview
    action; note its **7-day** window vs the cron hook's **24-hour** window
    (trap 2).
  - `AGENTS.md` + `node_modules/next/dist/docs/` if you touch anything
    framework-level (you shouldn't need to — this is a server-component render
    addition following the page's existing shape).

## Files to touch

| File | NEW/EDIT | Change |
|---|---|---|
| `lib/admin/repos/offerChanges.ts` | EDIT | Add `getDetectionOpsStatus()` — read-only counts + latest `created_at` |
| `app/admin/(protected)/monitor/page.tsx` | EDIT | Fetch the status in parallel; render one new Card |
| `docs/ozbargain-monitoring.md` | EDIT | Add "Detection go-live runbook" section |
| `FINAL-LAUNCH-CHECKLIST.md` | EDIT | Point §4's detection line at the runbook + monitor card |
| `PLAN-offer-change-detection-live.md` | EDIT | One-line banner at top: superseded by this plan (built dark in `89c8c26`/`8404c27`) |

## Step-by-step

### Step 1 — `getDetectionOpsStatus()` in `lib/admin/repos/offerChanges.ts`

Read-only, service-role (this file already is). Shape:

```ts
export interface DetectionOpsStatus {
  totalCandidates: number;
  /** Exact counts keyed by review_state (states from migration 004 / this repo). */
  byReviewState: Record<string, number>;
  /** ISO of the most recently staged candidate, or null if none ever. */
  latestStagedAt: string | null;
}
export async function getDetectionOpsStatus(): Promise<DetectionOpsStatus>
```

Implementation: one `head: true, count: "exact"` query per state plus a total
(copy `countWhere` from `dashboard.ts` — do NOT select rows), and one
`select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle()`
for `latestStagedAt`. Run them in a single `Promise.all`. Throw on error with a
prefixed message, matching the file's existing style.

### Step 2 — monitor page card

In `MonitorStatusPage` (`page.tsx:241`), add `getDetectionOpsStatus()` and the
flag read to the page's existing data fetching — if the page fetches
sequentially today, wrap yours with it in `Promise.all` rather than adding a
second waterfall. Flag state comes from the existing accessor
`ozbOfferDetectEnabled()` (`lib/env.ts:113`) — never inline `process.env`.

Render a new `<Card>` titled **"Offer-change detection"** (place it after the
cron-status content, before or beside "Latest feed items" — match surrounding
grid classes):
- A pill/badge for the flag: `Enabled` (emerald) / `Disabled` (muted), with one
  line of muted text: "Gates the post-run staging hook only — the preview panel
  works regardless."
- `CountPill`s for total + each review state (0s must render, not vanish).
- "Last candidate staged: {formatDate(latestStagedAt)}" or, when null:
  "Never — detection has not run in write mode." (use the page's existing
  `formatDate`, line 52 — it is already deterministic/AU).
- Two links: `/admin/offer-changes` ("Review candidates / run a preview") and
  the runbook doc path in muted text.

### Step 3 — runbook in `docs/ozbargain-monitoring.md`

Append a "## Offer-change detection: go-live runbook" section:

1. **Precision review (repeat on ≥2 different days):** open
   `/admin/offer-changes` → "Preview detection (dry run)" → run it. It scans
   the last **7 days** of staged items, capped at 200
   (`DETECTION_SCAN_LIMIT`, `lib/monitor/runDetection.ts:73`). Judge every
   candidate: is the provider right, the merchant right, the value real?
   **Zero candidates is a plausible, healthy result** — the heuristics demand
   provider AND parseable value AND resolvable merchant (precision over
   recall); an empty preview is not a bug and does not block go-live.
2. **Flip:** Vercel → Settings → Environment Variables → add
   `OZB_OFFER_DETECT_ENABLED=true` (Production) → redeploy. `.env.example`
   already documents the flag.
3. **Verify within a day:** the daily cron (02:00 UTC) or the external
   scheduler run returns a `detection` block in its JSON; `/admin/monitor` now
   shows non-null "last staged" once anything stages; candidates appear in
   `/admin/offer-changes` as `review_state='new'` for normal human review.
   Nothing auto-applies — Apply remains the only path to public data.
4. **Rollback:** remove the env var (or set `false`) + redeploy. No code
   revert. A detection failure can never fail the monitor run — the hook is
   fully try/caught (`route.ts:173–176`).

### Step 4 — checklist + stale-plan banner

- `FINAL-LAUNCH-CHECKLIST.md` §4, the `OZB_OFFER_DETECT_ENABLED` bullet: keep
  the "leave off until reviewed" instruction, add "follow the go-live runbook
  in docs/ozbargain-monitoring.md; post-enable status is visible on
  /admin/monitor".
- `PLAN-offer-change-detection-live.md`: insert at the very top:
  `> **STATUS (2026-07-10): SUPERSEDED.** The build this plan describes shipped
  dark in 89c8c26 (pipeline + flag hook) and 8404c27 (preview panel). Do not
  re-execute. Go-live is covered by PLAN-detection-go-live.md.`

### Step 5 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:admin && npm run test:monitor && npm run test:stack
```
`npm run dev` → `/admin/monitor`: card renders with flag **Disabled**, all
counts 0, "Never — detection has not run in write mode." (that IS prod truth).
Confirm `/admin/offer-changes` still renders and preview still runs.

## Edge cases & traps

1. **Empty-forever table.** `offer_change_candidates` has 0 rows in prod. Every
   render path must handle `latestStagedAt === null` and all-zero counts
   without looking broken — this is the page's day-one state, not an edge.
2. **Preview ≠ live-run volume.** Preview scans 7 days
   (`actions.ts:127`); the cron hook scans 24 hours (`route.ts:168`). A preview
   showing 5 candidates does not mean the first live run stages 5. Say this in
   the runbook so the human isn't surprised.
3. **Review-state vocabulary.** Do not hardcode guessed states. Read migration
   004 and the repo's `setOfferChangeReviewState`/apply path to enumerate the
   real values, and build `byReviewState` from that list so a `CHECK`-constraint
   state never silently drops from the card.
4. **Counts must be `head: true`.** Candidate rows carry raw feed titles;
   the ops card needs numbers, not content. Copy `dashboard.ts:45–68`.
5. **Monitor-logic guardrail.** CLAUDE.md: "Do not change monitor gate logic or
   fetching behaviour." Acceptance enforces zero diff under `lib/monitor/` and
   `app/api/cron/` — if you find yourself editing either, stop; the plan is
   render/docs only.
6. **`ozbOfferDetectEnabled()` reads env per-request on a `dynamic` page** —
   the offer-changes page already passes it as a prop
   (`offer-changes/page.tsx:82`); mirror that approach. If the monitor page is
   statically cached (check its route segment config), the flag/counts could go
   stale — the page already renders live monitor data, so it is dynamic; just
   don't add caching.
7. **No rate-limit / audit calls** — this is a read-only render. The mutation
   discipline (requireAdmin → rate limit → audit) applies to mutations; reads
   are gated by the `(protected)` layout + `requireAdmin` in the page's data
   path like the rest of the monitor page.
8. **Australian spelling** in card + runbook copy.

## Acceptance criteria

- [ ] `nvm use 20 && npm run lint && npm run build` pass;
      `test:admin`/`test:monitor`/`test:stack` all pass.
- [ ] `git diff --stat` shows **no changes** under `lib/monitor/`,
      `app/api/cron/`, or `vercel.json`.
- [ ] `/admin/monitor` renders the detection card with: flag state pill,
      total + per-state counts (zeros visible), never-ran message, working link
      to `/admin/offer-changes`.
- [ ] With prod data (0 candidates): card shows Disabled / 0 / "Never…" —
      matches `select count(*) from offer_change_candidates` = 0.
- [ ] `docs/ozbargain-monitoring.md` contains the 4-step runbook including the
      "zero candidates is healthy" note and the rollback step.
- [ ] `FINAL-LAUNCH-CHECKLIST.md` §4 references the runbook;
      `PLAN-offer-change-detection-live.md` carries the SUPERSEDED banner.
- [ ] (Human, after merge — not the model's step) Preview reviewed on ≥2 days →
      flag flipped in Vercel → next cron JSON contains a `detection` block →
      card shows a non-null last-staged time.

## Commit

```
Add detection ops status to /admin/monitor + go-live runbook
```
Gate: lint + build + three suites; `git status` shows only the five listed
files. Push to `origin/main` autonomously after `git pull --rebase`.
