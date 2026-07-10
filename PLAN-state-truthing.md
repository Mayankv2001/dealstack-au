# PLAN-state-truthing — Stamp shipped plans, refresh PROJECT_STATE.md

> **STATUS (2026-07-10): SHIPPED** in `4217595`. Kept as historical
> reference — do not re-execute.

> **Rank: 5 of 5 (2026-07-10 backlog) — but DO THIS FIRST: ~30 minutes,
> docs-only, and it de-risks every other phase.** The repo's coordination
> layer has drifted from reality, and in this project that is dangerous, not
> cosmetic: two accounts share `main`, phases are executed by
> less-capable-model sessions that follow PLAN files literally, and several
> PLAN files now instruct building things that already shipped. Concretely
> (verified 2026-07-10): `PLAN-offer-change-detection-live.md` asserts
> "**nothing invokes detection**" — false since `89c8c26` wired it into the
> protected cron route; a session following it would re-build a live pipeline
> inside guarded monitor code. `PLAN-cards-go-live.md` says `/cards` renders an
> empty state with 0 published — prod has 5/5 published. `PROJECT_STATE.md`
> ("single source of truth") says HEAD is `54fe741` and lists as "next" two
> plans (`docs-runbook-refresh`, `generated-db-types`) that shipped in
> `c77919d` and `8d2d219`. This plan makes every stale artefact tell the truth
> with a status banner, and refreshes PROJECT_STATE to the current backlog.

## Goal

Every `PLAN-*.md` in the repo root carries an accurate STATUS banner as its
first line (SHIPPED + hash / PARTIALLY SHIPPED + what remains / SUPERSEDED + by
what / PENDING). `PROJECT_STATE.md` reflects the real HEAD, the real completed
work, and the new 5-plan backlog. `FINAL-LAUNCH-CHECKLIST.md`'s drifted facts
are corrected. Markdown-only diff.

## Non-goals

- No code, config, test, or migration changes — `git diff --stat` must list
  only `.md` files.
- Do not delete or rewrite the bodies of shipped PLAN files (they are useful
  history and pattern references); banner only.
- Do not touch `PLAN-dq-mark-rechecked.md` (refreshed separately as an active
  plan in this backlog) or the four new `PLAN-*` files of the 2026-07-10
  backlog.

## Preconditions

- `git pull --rebase` on `main` (two-account rule); clean tree; `nvm use 20`
  (only needed for the commit-gate lint/build).
- Evidence commands you will use throughout:
  `git log --oneline -60`, `git log --oneline --all -- <path>`, and
  `git log -S "<distinctive string>" --oneline` to tie a plan to its commit.

## Files to touch

`PROJECT_STATE.md`, `FINAL-LAUNCH-CHECKLIST.md`, and the PLAN files listed in
the mapping table below. All EDIT, all markdown.

## Step-by-step

### Step 1 — verify the ship mapping (do not trust this table blindly)

For each row, run the verification and only then stamp. The hashes were
verified 2026-07-10 against `git log` and `PROJECT_STATE.md §4`; re-confirm
because other sessions may have pushed since.

| PLAN file | Status to stamp | Evidence commit(s) |
|---|---|---|
| PLAN-placeholder-copy-guard.md | SHIPPED | `7d2f293` |
| PLAN-verify-schema-drift.md | SHIPPED | `49086d0` |
| PLAN-route-smoke-tests.md | SHIPPED | `90a21f6` |
| PLAN-stores-index.md | SHIPPED | `aff00df` |
| PLAN-weekly-picks-on-deals.md | SHIPPED | `2835137` |
| PLAN-detection-dryrun-visibility.md | SHIPPED | `8404c27` |
| PLAN-card-offers-in-search.md | SHIPPED | `36f5434` |
| PLAN-cashback-cap-semantics.md | SHIPPED | `c6e31ed` |
| PLAN-generated-db-types.md | SHIPPED | `8d2d219` |
| PLAN-docs-runbook-refresh.md | SHIPPED | `c77919d` |
| PLAN-structured-data-seo.md | SHIPPED | `54fe741` |
| PLAN-stores-admin-crud.md | SHIPPED | `3a2282f` |
| PLAN-public-hardening.md | SHIPPED | `07d8049`, `831b99e` |
| PLAN-expired-offer-read-guard.md | SHIPPED | `5f952e7` (+ `59a754c` follow-up) |
| PLAN-feed-ingestion-recovery.md | SHIPPED | `53c4a50` |
| PLAN-feed-queue-scalability.md | SHIPPED | `6c62d04` |
| PLAN-offer-change-detection-live.md | SUPERSEDED | built dark in `89c8c26` + `8404c27`; go-live → `PLAN-detection-go-live.md` |
| PLAN-cards-go-live.md | PARTIALLY SHIPPED | admin wiring `2f0a9fb`; 5/5 published by admin 2026-07-08 — **but all 5 rows still carry "Illustrative" copy, `confidence='needs-verification'`, null expiry (prod-verified 2026-07-10). Remaining work is the human data-truthing in its Step 7; do not re-run Steps 1–6.** |
| PLAN-dq-mark-rechecked.md | (skip — active, refreshed 2026-07-10) | — |

### Step 2 — stamp the banners

Insert as the very first lines of each file (before the `#` title), so a
model that reads even one screenful cannot miss it:

```markdown
> **STATUS (2026-07-10): SHIPPED in `<hash>` — do not re-execute.**
> Kept for reference. Verify with `git log --oneline | grep <hash>`.
```

Adjust wording per the table for SUPERSEDED / PARTIALLY SHIPPED (include the
"what remains" sentence for cards-go-live exactly as in the table). If
`PLAN-detection-go-live.md` (rank 2 of this backlog) has already added its
banner to `PLAN-offer-change-detection-live.md`, keep that one — don't
double-stamp.

### Step 3 — refresh `PROJECT_STATE.md`

Update, keeping the section structure intact:
- **Header**: `Last updated: 2026-07-10`, current HEAD hash from `git log -1
  --format=%h`, working tree clean.
- **§2 Current Status**: daa2653 backlog complete except dq-mark-rechecked;
  new 5-plan backlog (2026-07-10): `PLAN-queue-relevance-triage.md`,
  `PLAN-detection-go-live.md`, `PLAN-admin-cleanup-page.md`,
  `PLAN-dq-mark-rechecked.md`, `PLAN-state-truthing.md`. Note the standing
  human task: replace the 5 illustrative published card offers with verified
  real data (checklist §11).
- **§4 Completed Work**: append the daa2653-backlog ships with hashes
  (`7d2f293`, `90a21f6`, `aff00df`, `49086d0`, `2835137`, `8404c27`,
  `36f5434`, `c6e31ed`, `9560080`, plus `8d2d219`/`c77919d`/`54fe741` if not
  already present).
- **§5 Current Task**: none / next = §6.
- **§6 Next 3 Tasks**: replace entirely with the new backlog's recommended
  order: 1) `PLAN-queue-relevance-triage.md`, 2) `PLAN-detection-go-live.md`,
  3) `PLAN-admin-cleanup-page.md` — with one-line whys. Keep the "confirm
  against git log before starting" warning; it just proved its worth.
- **§10 Known Issues**: add "prod: published card offers are illustrative
  (5/5, confidence needs-verification, null expiry)"; add the two
  expired-published gift cards (`gc-tcn-jbhifi`, and `gc-woolworths-wish` from
  2026-07-11) pending cleanup.
- **§11 Latest Changes**: refresh from `git log --oneline -10`.

### Step 4 — correct `FINAL-LAUNCH-CHECKLIST.md` drift

Targeted edits only (it was verified at `8d2d219`; a few facts moved):
- §5 known-item line: now **two** expired-published gift cards —
  `gc-tcn-jbhifi` (2026-07-02) and `gc-woolworths-wish` (2026-07-10, expired
  from the 11th); mention `/admin/cleanup` as the apply path once
  `PLAN-admin-cleanup-page.md` ships (conditional wording: "or the CLI").
- Header "verified against the codebase on 2026-07-09 (HEAD `8d2d219`)" →
  re-dated with the current HEAD.
- Leave everything else alone unless `git log` proves it stale — this file is
  largely accurate.

### Step 5 — verify + commit

```bash
git diff --stat            # ONLY .md files may appear
nvm use 20
npm run lint && npm run build   # commit gate (cheap insurance, md-only)
```

## Edge cases & traps

1. **Verify before stamping.** The mapping table is evidence-backed but this
   repo has already burned one session with a stale "verified" doc — every
   stamp needs its own `git log` confirmation at execution time (the other
   account may even have shipped `dq-mark-rechecked` by the time you run).
2. **`PLAN-cards-go-live.md` is the subtle one**: its Steps 1–6 shipped and its
   Step 7 (human publish) was *performed* — but performed without the
   verification the step demands, which is why prod has published illustrative
   rows. The banner must say "remaining = Step 7 done properly (verify against
   issuer sources, fix figures, set real expiry, confidence to confirmed)" —
   NOT "remaining = Step 7" as if untouched, and NOT "SHIPPED".
3. **Two plans may stamp the same file.** `PLAN-detection-go-live.md` also
   banners `PLAN-offer-change-detection-live.md`. Whichever runs second must
   detect the existing banner and skip, not stack a duplicate.
4. **HEAD moves.** Every hash you write into PROJECT_STATE header/§11 must be
   read from git at write time, not copied from this plan (this plan itself
   will be a commit by then).
5. **Don't "fix" PROJECT_STATE §10's resolved items** — the buildStack clock
   fix note is already marked RESOLVED; leave resolved history in place. Add,
   don't relitigate.
6. **Australian spelling** applies to these docs too.

## Acceptance criteria

- [ ] `head -3` of every PLAN file in the mapping table shows the correct
      STATUS banner; `PLAN-dq-mark-rechecked.md` and the four new 2026-07-10
      plans have none (they are the active backlog).
- [ ] `grep -L "STATUS (2026-07-10)" PLAN-*.md` lists ONLY the five active
      2026-07-10 plans.
- [ ] `PROJECT_STATE.md` header shows today + real HEAD; §6 lists the new
      backlog order; §2/§4/§10/§11 updated as in Step 3.
- [ ] `FINAL-LAUNCH-CHECKLIST.md` §5 names both expired gift cards.
- [ ] `git diff --stat` contains only `.md` files.
- [ ] `npm run lint && npm run build` pass (Node 20).

## Commit

```
Docs: stamp shipped/superseded PLAN files, refresh PROJECT_STATE to 2026-07-10 backlog
```
Gate: md-only diff + lint + build. Push to `origin/main` autonomously after
`git pull --rebase`.
