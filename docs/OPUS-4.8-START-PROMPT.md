# Opus 4.8 startup prompt — DealStack AU

> Copy-paste the block below as the first message to Opus 4.8 when it takes
> over this repository.

---

You are taking over DealStack AU (`~/Downloads/dealstack-au-clean`) from a
previous agent. Before doing ANY work, complete this startup sequence and
report back. Do not skip steps and do not start implementation.

1. **Read the handoff files, in this order:**
   - `CLAUDE.md` and `AGENTS.md` (hard rules; this repo's Next.js 16 differs
     from your training data — read `node_modules/next/dist/docs/` before
     writing framework code)
   - `docs/OPUS-4.8-HANDOFF.md` (primary operational handoff)
   - `docs/OPUS-4.8-HANDOFF.json` (machine-readable state snapshot)
   - `docs/DEALSTACK-DECISIONS.md` (why things are the way they are)
   - `docs/gift-card-offer-corrections-2026-07-12.md` (the active backlog)

2. **Verify the handoff against the repository.** Do not blindly trust
   summaries — including the handoff itself. It was accurate on 2026-07-12;
   time has passed. Repository contents, git history, and read-only production
   probes always win over any written summary. Known-stale docs are listed in
   handoff §A (e.g. `docs/gift-card-pipeline.md` claims migration 021 is
   unapplied — it is applied; `docs/launch-management/PROJECT_STATE.md`
   predates the gift-card pipeline).

3. **Inspect git state yourself:** `git status -sb`, `git log --oneline -15`,
   `git diff --stat`. At handoff the tree was clean at `1d7b87a` with `main`
   even with `origin/main`. Another account may have pushed since —
   `git pull --rebase` first.

4. **Verify production state read-only** (Supabase project
   `numgsivlrglflsnqehac`): confirm via `information_schema` — never the
   migration ledger, which is known-partial — that migrations 001–022 are
   applied; confirm the gift-card source gates
   (`gift_card_sources.gcdb`: `enabled`, `automated_fetch_allowed`) are still
   both false; re-read the published/candidate counts. `npm run verify:schema`
   (Node 22) is the scripted equivalent.

5. **State what is already complete.** Do NOT restart completed work. In
   particular: migrations 021 and 022 are applied and types regenerated; the
   gift-card view-model refactor is shipped; the one-off ingest test ran and
   ingestion was deliberately re-disabled; the expired gift-card cleanup
   (2026-07-11) is done; the launch-management worker backlog is closed.

6. **Identify contradictions or stale statements** between the handoff, other
   docs, the code, and production — list them explicitly before acting.

7. **Propose the smallest useful next phase** (the handoff recommends the
   §J production-data correction pass, which needs row-level approval) and
   **wait for my approval** before executing it.

8. **Preserve all safety boundaries, always:**
   - Do NOT apply migrations, modify production data, change RLS, or flip
     feature flags / source gates without my explicit approval for that
     specific action.
   - Do NOT commit or push until I have approved the proposed work (after
     that, routine git to `origin/main` is autonomous per standing preference).
   - Nothing external ever auto-publishes; all staged data goes through admin
     review; production data corrections go through the audited admin edit UI,
     never raw SQL.
   - RSS/Atom only — no HTML scraping, no bypassing Cloudflare/robots/logins.
   - One-per-day Vercel crons only; don't touch `app/layout.tsx` or
     `app/globals.css`; keep the service-role key server-side; Australian
     spelling and AUD formatting; keep changes small and reviewable.
   - Run on Node 20 (`nvm use 20`); Node 22 only for `npm run seed` and
     `verify:schema`. Full validation gate before any commit
     (handoff §L).

Report the results of steps 3–7 concisely, then stop and wait.
