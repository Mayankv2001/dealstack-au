# Runbook — Offer accuracy incident

For when published offer *content* is wrong: wrong discount percentage, wrong retailer, wrong conditions, wrong acceptance list, a predicted offer presented as confirmed, or savings maths that doesn't match reality. (Wrong *expiry* ⇒ EXPIRED-OFFER-INCIDENT.)

## Severity triage
- **P0:** wrong price/saving on a live offer; a prediction shown as a confirmed current offer; "verified" label on unverifiable data. Stop-the-bleeding first, diagnose second.
- **P1:** wrong secondary conditions (limits, acceptance nuance), stale-but-labelled-stale content.

## Stop the bleeding (P0, admin, audited)
Unpublish or correct the specific offer via the admin edit/review surfaces (RPC-backed, audited). One row, smallest change. Public read paths update immediately; ISR clears ≤ 5 min. Do not touch anything else until the wrong version is off the page.

## Then find which boundary failed (read-only)
Every published offer passed: ingest/extract → classify → duplicate detection → human review with `approvalValidation`/`approvalSafeguards`/`publishReadiness` → approve RPC. Walk backwards:
1. **Row history/audit:** who approved, when, from which candidate; what did the diff look like at approval (transactional audit, migration 011 + gift-card closeouts).
2. **Source payload:** was the source itself wrong, or did extraction mangle it? Re-run the parser on the captured payload locally (pure functions; `tests/giftcards/extractOffer.test.ts` harness).
3. **Validation gap:** should `approvalValidation`/`publishReadiness` have caught it? If yes ⇒ code task with the failing case as a fixture.
4. **Review miss:** validation couldn't have caught it (semantic error) and the reviewer approved in good faith ⇒ process finding: what comparison/diff view was missing (DS-050 class)?
5. **Prediction leak (if applicable):** predictions are admin-only except the clearly-historical `/gift-cards/history`. If one rendered as current anywhere else, that's a P0 code defect — reproduce, file with the route.
6. **Stack-maths complaint:** if the offer data is right but the displayed saving is wrong, reproduce through the pure engine (`lib/stack/buildStack.ts` tests) with the exact inputs; also check whether the user compared against the simplified calculator (known divergence — `tasks/deal-engine/TASK-STACK-001`).

## Recovery
- Correct data via admin flow; re-verify against the source; re-publish only after the boundary gap is understood.
- Code/validation gap ⇒ task file with the incident row as the test fixture; the incident is not closed until the regression test exists.
- Systemic extraction error ⇒ check for siblings: same source + same window candidates, review each (bulk tools capped at 200).

## Requires approval
- Any correction beyond the single offending offer; anything touching approval RPCs or validation rules.

## Never casually
- Direct SQL edits (audit trail is the incident record).
- Weakening a validation rule to make re-publishing easier.
- Blaming the reviewer before checking what the tooling showed them.

## Validation after recovery
Corrected offer verified against source; regression test merged (if code gap); sibling sweep done; incident written up (what failed, which layer, prevention) in the ops log.

## Escalation
Review-process owner: (fill in). For source-side falsehoods, source contact per `docs/gift-card-source-policy.md`.
