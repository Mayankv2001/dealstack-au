---
name: phase
description: >-
  Run one controlled DealStack AU development phase end-to-end: scope check,
  implement only the named phase, verify with lint/build/tests, commit, push,
  summarise, then stop. Use this whenever the user asks for the "next phase",
  a "controlled phase", a "polish pass", a "small fix phase", or describes a
  single bounded piece of work they want built, verified and shipped in one
  go — even if they don't say the word "phase". The user should only need to
  describe WHAT the phase does; all standing guardrails, the verification
  checklist, and the commit ritual are handled here.
---

# Controlled Phase Runner

Execute exactly one development phase: the one described in the arguments
(or in the user's message). The whole point of this workflow is small,
reviewable, individually shipped increments — a phase that grows beyond its
description defeats it.

## 1. Establish state (before editing anything)

- Run `git status` and `git log --oneline -5` to confirm a clean tree on
  `main` in the DealStack AU repo. If the tree is dirty with unrelated work,
  stop and report it instead of mixing it into this phase.
- Read the files the phase touches before changing them. Do not assume the
  previous session's description of them is still accurate.
- Do NOT ask the user to confirm the plan or approve routine steps. The user
  has standing instructions: proceed autonomously through commit and push.

## 2. Standing guardrails

All Safety Rules in AGENTS.md apply to every phase — they do not need to be
restated in the prompt. The ones violated most easily in practice:

- Everything external (feed items, offer changes) is staged for admin
  review; never auto-publish, auto-import, or auto-approve anything.
- Never write to `ozbargain_signals` from monitor/cron code.
- RSS/Atom feeds only — no HTML scraping, no bypassing robots.txt or
  anti-bot measures.
- Don't touch `app/layout.tsx`, `app/globals.css`, the `vercel.json` cron
  schedule, or RLS policies unless the phase explicitly says to.
- Service-role key stays in server-side code (`lib/admin/repos/` behind
  auth); no Cashrewards references; Australian spelling and AUD formatting
  in user-facing copy.

If the phase description appears to require breaking one of these rules,
say so and stop rather than working around it.

## 3. Scope discipline

- Touch only the files the phase requires. If the phase names specific
  files, treat that list as the boundary.
- When you notice adjacent problems (stale copy, a bug in a neighbouring
  page, missing tests), do not fix them here. Record them for the summary
  as next-phase candidates. Mixed commits are what this workflow exists to
  prevent.
- Keep the diff small enough that the user can review it from the commit
  alone.

## 4. Verify

Node matters in this repo: the shell defaults to an old Node, so run
`nvm use 20` in the same shell invocation as each command below
(`npm run seed` is the exception — it needs Node 22).

Required before every commit:

1. `npm run lint`
2. `npm run build`
3. `npm run test:monitor` — only if monitor/feed/top-deals/ranking logic changed
4. `npm run test:stack` — only if stack/calculation logic changed

If any of these fail, fix the failure as part of the phase. Never commit on
a failing build or lint, and never report the phase complete with a
skipped check — report the failure honestly instead.

## 5. Commit and push

- `git status` first; stage the intended files explicitly by path — not
  `git add .` — so stray files can't ride along.
- Commit message: short imperative summary of the phase, e.g.
  `Polish admin audit filters` or `Add card offers empty state`. No
  boilerplate paragraphs.
- Push to `origin/main` without asking. (Standing user preference:
  commit/merge/push autonomously; only destructive git operations need
  confirmation.)

## 6. Summarise, then stop

End with a summary the user can read in under a minute:

- **Shipped:** one sentence on what the phase did.
- **Files changed:** the list, with one clause each on why.
- **Checks:** which of lint/build/test:monitor/test:stack ran and their
  results.
- **Noticed but not touched:** adjacent issues found during the phase, as
  candidates for the next phase.

Then stop. Do not begin the next phase, ask "want me to continue?", or
start speculative follow-up work — the user reviews each phase in
production before deciding what comes next.
