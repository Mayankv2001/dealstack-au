# DealStack AU — Recommended automations

> Distilled 2026-07-12 from the last month of repository work (migrations
> 005–022, launch management, monitor/pipeline/gift-card phases). These are
> **proposals only** — none is built. Each entry names the repeated pain it
> removes, the shape it should take (repo skill in `.claude/skills/` or npm
> script), inputs, safety gates, and whether it is safe to build now.
> The existing `/phase` skill already covers the core
> inspect → plan → implement → validate → commit loop; the proposals below
> fill the gaps around it.

---

## 1. `/full-gate` — one-command validation runbook

- **Pain:** The full pre-commit gate (handoff §L) is nine commands across two
  Node concerns, retyped for every phase; partial runs have caused
  "green-but-not-really" reports (e.g. giftcards/deals suites are not in
  ci.yml).
- **Proposal:** npm script `validate:all` (or skill) running: lint → `tsc
  --noEmit` → `vitest run` → build → e2e → `git diff --check`, echoing a
  per-step pass/fail summary table, refusing to run on Node ≠ 20.
- **Inputs:** none (optional `--skip-e2e` for docs-only changes).
- **Safety gates:** read-only; fails loudly on first red step.
- **Output:** summary table + non-zero exit on any failure.
- **Why automate:** it is run before literally every commit; the summary table
  doubles as the honest completion report.
- **Safe to build now:** ✅ yes — pure local tooling.

## 2. `/migration-rollout` — migration review / apply / regenerate / verify ritual

- **Pain:** The 021 and 022 rollouts each required the same hand-sequenced
  ritual: review SQL → user approval → apply via MCP → probe
  `information_schema` → `npm run types:gen` → `tsc --noEmit` → update
  `scripts/schema-manifest.ts` → `test:admin` → before/after public-data hash
  → commit types+manifest together. Historical drift (005) came from skipping
  steps of exactly this ritual.
- **Proposal:** a repo skill that walks the checklist interactively, hard-stops
  for explicit user approval before the apply step, and runs the offer-hash
  comparison automatically.
- **Inputs:** migration filename.
- **Safety gates:** user approval before apply; read-only probes before/after;
  refuses if `git status` is dirty.
- **Output:** applied migration + regenerated types + manifest update + hash
  evidence, in one reviewable commit.
- **Why automate:** highest-blast-radius recurring workflow in the project.
- **Safe to build now:** ✅ yes as a checklist skill (the apply step stays
  manual/approved by design).

## 3. `/offer-audit` — production offer audit and correction pass

- **Pain:** The 2026-07-10 card-offer audit and the 2026-07-12 gift-card audit
  were both hand-built: SELECT all published rows → diff against source
  expectations → write a corrections doc → apply row-by-row via admin UI.
  This recurs every time offers age (staleness threshold is 21 days).
- **Proposal:** read-only script `npm run audit:offers` that dumps every
  published offer (all types) with staleness, missing-field, expiry-proximity
  and duplicate-verdict flags (reusing `duplicateDetection.ts` and the
  readiness gates), emitting a Markdown table matching the corrections-doc
  format.
- **Inputs:** `--type=giftcards|cards|all`, `--base` for the Supabase env.
- **Safety gates:** strictly read-only (anon or service-role SELECT only);
  corrections themselves stay manual through the audited admin UI.
- **Output:** `docs/offer-audit-<date>.md` draft.
- **Why automate:** the detection half is mechanical; only the judgement half
  needs a human.
- **Safe to build now:** ✅ yes — read-only by construction.

## 4. `/controlled-ingest-test` — one-shot gated cron test

- **Pain:** The 2026-07-12 GCDB test required a precise open-gates → `?force=1`
  curl → inspect run row → review candidates → close-gates sequence; forgetting
  the re-close step would silently leave automated fetching enabled.
- **Proposal:** a skill that scripts the sequence with explicit user approval
  at the gate-opening step and **guaranteed gate re-closure** (the runGuarded
  pattern, applied to ops): open → trigger → verify run row → always re-close
  and print the post-state of both gate booleans.
- **Inputs:** source id (`gcdb`), target base URL.
- **Safety gates:** user approval to open gates; unconditional re-close in a
  finally step; read-only verification queries before and after.
- **Output:** run-row summary + candidate count + confirmation gates are closed.
- **Why automate:** the failure mode (gates left open) is exactly the kind of
  quiet state drift that costs days later.
- **Safe to build now:** ⚠️ build the skill now, but every execution still
  requires explicit user approval (it touches production gates).

## 5. `/visual-check` — visual regression against production-shaped data

- **Pain:** The gift-card card blowout (33-brand string, null dates,
  0%-points rows) was invisible with tidy local fixtures; catching it required
  manually crafting prod-shaped rows. Committed OzB fixtures are synthetic
  too — the real feed has fields the fixtures lack.
- **Proposal:** a fixtures module of "ugly but real" rows (longest brand
  string, null expiry, points-as-discount legacy shape, compound campaign) +
  a script that boots `next start` with `DATA_SOURCE=static` pointing at those
  rows and screenshots the key pages (Playwright is already configured).
- **Inputs:** page list (default: `/gift-cards`, one detail page, `/deals`,
  homepage).
- **Safety gates:** fully local; never reads prod.
- **Output:** screenshot set for eyeball diff (optionally
  `toHaveScreenshot` assertions later).
- **Why automate:** every UI phase needs it; the hard part (realistic fixture
  shapes) is knowledge that should be frozen into code before it fades.
- **Safe to build now:** ✅ yes.

## 6. `/post-merge-verify` — deployed-state verification

- **Pain:** After each push, verifying the deploy meant hand-running smoke
  against prod, checking `/api/health/*` and eyeballing key pages; it was
  skipped when time was short (and stale-doc drift like PROJECT_STATE is the
  result of the same "after-merge" step being manual).
- **Proposal:** script chaining `npm run smoke -- --base-url=<prod>
  --strict-content` + bearer-authed health probes + a reminder checklist to
  update `docs/launch-management/PROJECT_STATE.md`/handoff counts when
  subsystem state changed.
- **Inputs:** prod base URL; `CRON_SECRET` from env for the health probes.
- **Safety gates:** read-only GETs only.
- **Output:** pass/fail summary; doc-update reminder.
- **Why automate:** cheap, high-signal, and the manual version demonstrably
  gets skipped.
- **Safe to build now:** ✅ yes.

## 7. CI gap closure (not a skill — a one-line-ish fix)

- **Pain:** `.github/workflows/ci.yml` runs monitor/stack/admin suites but not
  `test:giftcards` or `test:deals`; the newest subsystem has no CI coverage on
  PRs from other accounts.
- **Proposal:** add the two suites to ci.yml (or replace the four lines with
  `npx vitest run`).
- **Safety gates:** none needed; secretless CI stays secretless.
- **Safe to build now:** ✅ yes — smallest and highest-value item on this list.
