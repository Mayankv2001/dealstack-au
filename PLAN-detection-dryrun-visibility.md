# PLAN: Detection dry-run visibility — make the go-live review actually possible

> **Rank: 3 of 5.** Offer-change detection is fully built and wired dark
> (commit `89c8c26`): heuristics (`lib/monitor/detectOffers.ts`),
> orchestrator (`lib/monitor/runDetection.ts`), service-role persistence
> (`createDetectionPersistence` in `lib/admin/repos/offerChanges.ts:328`),
> and env-gated hooks in both entry points
> (`app/api/cron/monitor-feeds/route.ts:162-177`,
> `scripts/monitor-feeds.ts:251-269`). The documented go-live condition
> (`.env.example`, PROJECT_STATE §6.3) is: *eyeball a few dry-runs, then
> set `OZB_OFFER_DETECT_ENABLED=true` in Vercel*. But a dry-run today
> prints **only four counters** (`scanned / detected / deduped / inserted`)
> — there is literally nothing to eyeball. This plan adds the missing
> visibility: candidate-level dry-run output in the CLI, plus a read-only
> "Preview detection" panel on `/admin/offer-changes` so the owner can
> review precision from the admin portal without a local prod-env setup.
> It supersedes the stale
> `PLAN-offer-change-detection-live.md` (whose implementation steps already
> shipped as `89c8c26` — do not re-execute that file; its rollout section
> remains the reference for the eventual flag flip).

## Prerequisites

- `nvm use 20`; read `AGENTS.md` (server actions / client islands are
  Next.js 16 — check `node_modules/next/dist/docs/` if unsure about
  `useActionState` / `"use server"` conventions in this version).
- Read fully before coding:
  - `lib/monitor/runDetection.ts` — the WHOLE module (110 lines): the
    `DetectionPersistence` contract, `DetectionSummary`,
    `DETECTION_SCAN_LIMIT = 200`, and how `dedupeOfferChangeCandidates`
    produces exactly-what-would-be-inserted.
  - `lib/monitor/offerChanges.ts` — `OfferChangeCandidateInsert` (the row
    shape you will surface) and `buildOfferChangeCandidates`.
  - `scripts/monitor-feeds.ts` — `printDetection` (:138-158) and the
    detection hook (:251-269).
  - `app/api/cron/monitor-feeds/route.ts` — the detection hook (:162-177)
    and the response-hygiene comment at :145 ("raw titles/bodies are never
    echoed back").
  - `app/admin/(protected)/offer-changes/page.tsx` + `actions.ts` +
    `OfferChangesClient.tsx` — the conventions to mirror (requireAdmin
    first in every action; client islands receive server actions as
    props/imports and never import admin repos).
  - `tests/monitor/detectOffers.test.ts:119-218` — the `fakePersistence`
    harness your new tests extend.

## Goal

Both dry-run surfaces show the operator the actual would-be
`offer_change_candidates` rows — provider, merchant, previous → proposed
value, resolved-target status, title, URL — while writing nothing:

1. `npm run monitor:feeds -- --dry-run` (flag on) prints one block per
   candidate.
2. `/admin/offer-changes` gains a "Preview detection (dry run)" panel:
   admin clicks a button, a server action runs `runDetection` with
   `dryRun: true` over the last 7 days of staged items, and the would-be
   candidates render in the panel. Works **regardless** of
   `OZB_OFFER_DETECT_ENABLED` (its purpose is pre-enable review); the
   panel shows the flag's current state so the operator knows whether the
   cron would stage anything yet.

The cron route's JSON stays counts-only and byte-identical when the flag
is off. Nothing is ever inserted from any preview path.

## Exact files to touch

| File | Change |
|---|---|
| `lib/monitor/runDetection.ts` | `includeCandidates?: boolean` option; optional `candidates?` on the summary |
| `scripts/monitor-feeds.ts` | Pass `includeCandidates: dryRun`; print per-candidate detail |
| `app/admin/(protected)/offer-changes/actions.ts` | New `previewDetectionAction` (read-only) |
| `app/admin/(protected)/offer-changes/DetectionPreviewClient.tsx` | **New** client island: button + results panel |
| `app/admin/(protected)/offer-changes/page.tsx` | Render the panel; pass flag state |
| `tests/monitor/detectOffers.test.ts` | Cover `includeCandidates` on/off × dryRun on/off |
| `.env.example` | Mention the admin preview as the recommended review path |

**Zero diff** to: `lib/monitor/runMonitor.ts`, `detectOffers.ts`, all
gates, `vercel.json`, and the cron route (`route.ts` is NOT in the table —
see edge case 1).

## Step-by-step implementation order

### Step 1 — `lib/monitor/runDetection.ts`

```ts
export interface DetectionOptions {
  sinceIso: string;
  dryRun: boolean;
  /** When true, the summary carries the deduped would-be inserts. Leave
   *  unset on the cron path — raw titles must not enter the route JSON. */
  includeCandidates?: boolean;
}

export interface DetectionSummary {
  scanned: number;
  detected: number;
  deduped: number;
  inserted: number;
  /** Present ONLY when includeCandidates was set. */
  candidates?: OfferChangeCandidateInsert[];
}
```

At the end of `runDetection`, after computing `deduped`/`inserted`:
`return { scanned, detected, deduped, inserted, ...(opts.includeCandidates ? { candidates: deduped } : {}) }`
— where `deduped` here is the array (rename the local count vs array
variables cleanly; today `deduped` is the array and the summary field is
its length — keep the summary field a number).

### Step 2 — `scripts/monitor-feeds.ts`

- Detection call (:258): add `includeCandidates: dryRun` to the options.
- `printDetection`: after the counters, when `detection.candidates` is
  present, print each one:

```
  1. [cashback] ShopBack @ myer   8% → 15%   target: linked
     title: 15% Cashback at Myer via ShopBack (Max $30)
     url:   https://www.ozbargain.com.au/node/…
```

  Fields: `source_type`, `source_name`, `merchant_id` (or "—"),
  `previous_value ?? "?"` → `proposed_value`, `target_id` present ⇒
  "linked" else "unresolved (Apply will refuse)", `detected_title`,
  `detected_url`. Keep it plain `console.log` like the rest of the file.

### Step 3 — `previewDetectionAction` in `offer-changes/actions.ts`

```ts
export type DetectionPreviewResult =
  | {
      ok: true;
      flagEnabled: boolean;
      scanned: number;
      detected: number;
      deduped: number;
      candidates: OfferChangeCandidateInsert[];
    }
  | { error: string };

export async function previewDetectionAction(): Promise<DetectionPreviewResult> {
  await requireAdmin();
  try {
    const { runDetection } = await import("@/lib/monitor/runDetection");
    const { createDetectionPersistence } = await import(
      "@/lib/admin/repos/offerChanges"
    );
    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const summary = await runDetection(createDetectionPersistence(), {
      sinceIso,
      dryRun: true,
      includeCandidates: true,
    });
    return {
      ok: true,
      flagEnabled: ozbOfferDetectEnabled(), // import from "@/lib/env" — never read process.env ad hoc
      scanned: summary.scanned,
      detected: summary.detected,
      deduped: summary.deduped,
      candidates: summary.candidates ?? [],
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Preview failed." };
  }
}
```

Notes: `requireAdmin()` first, like every sibling action. No
`checkAdminRateLimit` (that budget is for mutations; this is a read — see
edge case 6). No `logAudit` (nothing changed). No `revalidatePath`.

### Step 4 — `DetectionPreviewClient.tsx` (new client island)

- `"use client"`; imports: `useState`/`useTransition`, `Button`, `Card`,
  `Badge`, and `previewDetectionAction` + `type DetectionPreviewResult`
  from `./actions` — plus `import type { OfferChangeCandidateInsert } from
  "@/lib/monitor/offerChanges"` (type-only; never import the admin repos).
- UI: a `Card` titled "Preview detection (dry run)" with copy:
  *"Runs the offer-change heuristics over feed items staged in the last 7
  days and shows what WOULD be staged. Nothing is written."* A badge shows
  `Detection flag: ON/OFF` (from the action result after the first run, or
  pass the initial value as a prop from the page). Button "Run preview" →
  `startTransition(async () => setResult(await previewDetectionAction()))`,
  disabled while pending.
- Results: the three counters, then one row per candidate mirroring the
  queue's vocabulary (source type badge, `source_name`, store id,
  `previous_value ?? "?"` → `proposed_value`, "target linked" /
  "unresolved", title, and the detected URL as plain text or an external
  link with `rel="noreferrer"`). `deduped === 0` renders *"Nothing new
  would be staged — items already staged/ignored are deduped by content
  hash and URL."*
- Style: match the admin pages (existing `Card`/`Badge`/`Button` usage in
  `OfferChangesClient.tsx`); soft-emerald accents; Australian spelling.

### Step 5 — wire into `offer-changes/page.tsx`

Render `<DetectionPreviewClient initialFlagEnabled={ozbOfferDetectEnabled()} />`
(import the accessor from `@/lib/env`) between the "Nothing here is
published automatically" notice and the queue/empty-state. The page is a
server component, so reading env here and passing a boolean is safe.

### Step 6 — tests (`tests/monitor/detectOffers.test.ts`)

Extend the existing `fakePersistence` harness:

- `includeCandidates: true, dryRun: true` → `summary.candidates` has the
  deduped rows, `insertCandidates` **not called**, `inserted === 0`.
- `includeCandidates: true, dryRun: false` → `summary.candidates` deep-equals
  the array passed to `insertCandidates`.
- Option absent → `summary.candidates === undefined` (pins the cron-path
  hygiene guarantee).

### Step 7 — `.env.example` + verify

Reword the `OZB_OFFER_DETECT_ENABLED` guidance: review precision EITHER via
`npm run monitor:feeds -- --dry-run` (flag on locally) OR the "Preview
detection" panel on `/admin/offer-changes` (works with the flag off), then
enable in Vercel.

```bash
npm run test:monitor && npm run test:stack && npm run test:admin
npm run lint && npm run build
npm run monitor:feeds -- --dry-run   # with OZB_OFFER_DETECT_ENABLED=true in .env.local
```

## Edge cases a weaker model would miss

1. **Do not add candidates to the cron route's JSON.** The route's stated
   posture is that raw feed titles/bodies are never echoed back
   (`route.ts:145`), and its detection call must stay counts-only — that is
   exactly why `includeCandidates` is opt-in and the route doesn't set it.
   The route file should have **zero diff** in this plan.
2. **The preview must NOT check `ozbOfferDetectEnabled()` before running.**
   The flag gates the *write hook* in the two entry points; the preview's
   entire purpose is pre-enable review. Gate on `requireAdmin()` only, and
   *display* the flag state instead.
3. **`candidates` must be the DEDUPED array** (what `insertCandidates`
   would receive), not the raw detections — otherwise the operator reviews
   phantom rows that dedupe would drop, and the preview lies about volume.
4. **A 0-candidate preview right after a write-mode run is correct
   behaviour**, not a bug: `listKnownCandidateKeys` dedupes against ALL
   existing candidates (any review_state), so already-staged and ignored
   items never reappear. Surface `detected` vs `deduped` so this state is
   legible, and say so in the empty-state copy.
5. **Serialisability:** server-action return values cross the RSC boundary.
   `OfferChangeCandidateInsert` is already plain JSON (strings/nulls) —
   keep it that way; do not put `Date` objects or class instances in the
   result.
6. **Skip the admin rate limiter deliberately, and say so in a comment.**
   `checkAdminRateLimit` meters a *mutation* budget backed by
   `admin_rate_limits`; consuming it for a read-only preview would let
   previews starve real Apply/Ignore actions. Debounce instead: the button
   is disabled while the transition is pending.
7. **7-day window vs the cron's 24h is intentional** — the operator reviews
   on demand, possibly days after the last fetch; the scan is still bounded
   by `review_state='new'` + `DETECTION_SCAN_LIMIT` (200). Do not raise the
   limit and do not make the window unbounded.
8. **Dynamic imports in the action mirror the existing hooks** (route and
   script both `await import(...)` the detection modules) — keep that
   pattern so the detection code stays out of every bundle that doesn't
   use it.
9. **Known heuristic limitation to state in the panel copy:** merchant
   matching runs on the static store alias table
   (`lib/sources/normalise.ts:29-39`, built from `lib/data.ts`). Feed items
   about a store that exists only in the DB (added via `/admin/stores`)
   resolve no merchant and are skipped by design
   (`detectOffers.ts:100-101`). Reviewers should not expect candidates for
   such stores; widening the matcher is a separate future change.
10. **The client island must not import `lib/admin/repos/*` or `lib/env`**
    — service-role code and env reads stay server-side; the island gets
    data only via the action result and props (this mirrors
    `OfferChangesClient`'s "never imports the detection module" comment).

## Acceptance criteria

- [ ] `git diff` shows **no changes** to `app/api/cron/monitor-feeds/route.ts`,
      `lib/monitor/runMonitor.ts`, `lib/monitor/detectOffers.ts`,
      `vercel.json`.
- [ ] With the flag off entirely: cron behaviour and response JSON are
      byte-identical to before (counts never included candidates there
      anyway); the admin preview still works.
- [ ] `npm run monitor:feeds -- --dry-run` (flag on) prints one detailed
      block per would-be candidate and
      `select count(*) from offer_change_candidates` is unchanged after.
- [ ] On `/admin/offer-changes`, "Run preview" renders counters + candidate
      rows; `countNewOfferChanges()` / the queue list are unchanged
      afterwards; the flag badge reflects the environment.
- [ ] Preview as a non-admin session is impossible (action throws via
      `requireAdmin`; page already redirects).
- [ ] New tests pin: candidates present only with `includeCandidates`;
      dry-run inserts nothing; write-mode candidates === insert payload.
- [ ] All suites + lint + build pass (Node 20).
