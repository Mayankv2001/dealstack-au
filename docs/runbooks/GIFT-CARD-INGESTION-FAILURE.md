# Runbook — Gift-card ingestion failure

For failures in the GCDB daily ingest, Point Hacks weekly ingest, or the downstream reconcile/lifecycle chain.

## Pipeline shape (what "working" means)
- **Ingest** (`/api/cron/gift-card-ingest`, GCDB RSS; `/api/cron/gift-card-weekly-ingest`, Point Hacks page): fetch → parse (`parseGcdbFeed` / `pointHacksWeekly`) → extract (`extractOffer`) → classify (`classifyChange`) → **stage candidates only**. Nothing publishes without admin review.
- **Reconcile** (`/api/cron/gift-card-reconcile`, 23:00 UTC): no-fetch pass over current DB state — source-removed/expired/prediction/acceptance outcomes — then fans into one lifecycle transaction.
- **Lifecycle** (`/api/cron/gift-card-lifecycle`): activate/archive/history-seal + path revalidation.
- Guard chain on every route: secret → env flag → DB source gates → Sydney-hour (ingest only) → interval → lock. All default-off.

## Symptoms
Red Actions run; ledger row `fail`; review queue suddenly empty (no new candidates) or flooded; parse-error spike; reconcile taxonomy counts anomalous.

## Safe checks (read-only)
1. **Ledger first** (`/admin/monitor` gift-card job runs): status, error text, per-stage evidence, duration.
2. **Skip vs fail:** `skipped` + reason = gate behaviour (often intentional; see EMERGENCY-SOURCE-PAUSE). `fail` = read the error.
3. **Classify the failure stage:**
   - *Fetch:* HTTP status in the error. Source down, moved, or blocking us. Do NOT retry-storm a source that is refusing us — that's a compliance conversation. Check the URL against `lib/security/urlPolicy.ts` allowlists (a source URL change will fail-closed here by design).
   - *Parse/extract:* feed shape changed. Reproduce locally: the parsers are pure — feed the captured payload through `tests/giftcards/parseGcdbFeed.test.ts`-style harness. A shape change needs a parser task, not a replay. Beware: committed fixtures are synthetic; capture the real payload shape before concluding a field vanished (known gotcha).
   - *Stage/DB:* Supabase errors — check Supabase status + `get_logs`; schema drift would show in `schema-drift.yml`.
4. **Locks:** a run stuck `running` self-heals via the 15-minute stale-run takeover (migration 030). Older stuck rows with no takeover = real finding; capture, don't edit.
5. **Duplicate/flood intake:** duplicate detection feeds review; if the queue floods with near-dupes after a source format change, pause the source (gates) and fix the parser first.

## Recovery options
- Transient fetch/DB failure ⇒ next scheduled window usually self-heals; a same-day retry needs MANUAL-PIPELINE-REPLAY (`force` bypasses only the hour gate; interval guard still applies — see its notes).
- Parser break ⇒ pause source (optional), write the fix with the captured payload as a fixture, validate `npm run test:admin` + `tests/giftcards/`, ship through normal review, replay.
- Source blocking/moved ⇒ compliance/permission conversation before ANY technical workaround. Never change allowlists casually.

## Requires approval
- Source URL / allowlist changes (`lib/security/urlPolicy.ts`).
- Un-pausing, cadence changes (Point Hacks is weekly — ADR-003), or anything touching the approval boundary.

## Never casually
- Publishing/approving candidates to "unblock" the pipeline — review is the product's integrity.
- Editing staged rows or run/lock rows by hand.
- Re-fetching a refusing source repeatedly.

## Validation after recovery
Green ledger run with sane counts; review queue receiving candidates; reconcile taxonomy back to baseline; public pages unaffected throughout (they only ever see approved data — verify that stayed true).

## Escalation
Pipeline owner: (fill in). Source policy: `docs/gift-card-source-policy.md`.
