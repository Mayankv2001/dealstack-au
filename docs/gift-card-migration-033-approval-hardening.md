# Migration 033 — gift-card approval and publication hardening

> Design only. Not applied to any environment by this work. No candidate was
> approved and no production data, source gate, ingestion job or deployment was
> changed.

## Purpose and prerequisites

Migration 023 is already recorded in production and is not a safe recovery
target. Migration 033 is the forward replacement for the remaining approval
boundary defects. It must run after 031 (the `fixed_points` convergence) and
032 (Sydney lifecycle state and deferred candidate lineage). Its application
also assumes the 021/022/023 candidate, raw-source and detail columns exist.

## Changes

- Replaces `approve_gift_card_candidate` without changing its signature.
- Serialises each text offer ID with a transaction advisory lock and locks the
  candidate and existing canonical row.
- A changed candidate may update only `approved_offer_id`. A new candidate may
  reuse an existing ID only when source, raw item and stable sub-offer lineage
  all match; unrelated or legacy-null lineage is rejected.
- Requires `confidence = 'confirmed'`, complete atomic mechanic facts and a
  valid date model. The linked raw item must still have `processing_status =
  'parsed'`; rejected parser snapshots and already-expired candidates are
  rejected.
- Requests public state only for a current/ongoing confirmed offer. The 032
  trigger converts a future approval to private `approved-future`, for later
  lifecycle activation.
- Treats an exact retry of an already-approved candidate/offer link as a no-op;
  any other candidate reuse fails.
- Keeps canonical upsert, candidate approval/link and audit insertion in the
  same transaction. The RPC remains `SECURITY DEFINER`, uses an empty
  `search_path`, qualifies objects/functions and is executable only by
  `service_role`.
- Adds a publication-lineage trigger. Existing visible legacy rows are left in
  place, but a new/restored public or approved-future row requires candidate
  lineage, which 032 verifies as approved and bidirectional at commit.
- Adds a `NOT VALID` reviewed-lifecycle check. It does not retro-validate or
  rewrite legacy rows, while new/updated reviewed states require confirmed
  confidence. A second forward check requires a positive value for newly
  written fee-waiver mechanics without rewriting legacy records.
- Replaces public offer RLS with a confirmed, Sydney-date-bounded policy with
  two arms: currently-active published offers, and lineage-carrying
  `approved-future` offers (the public "upcoming" tier — the carousel, grid
  and detail pages present reviewed future offers with honest "Starts …"
  labels, while the stack engine keeps excluding them app-side until their
  start date). The upcoming arm is bounded by expiry rather than lifecycle
  activation, so public visibility is date-driven even if the lifecycle cron
  lags. Legacy unconfirmed/expired inconsistencies stay hidden without being
  deleted. (Revised 2026-07-21, before first apply: the originally authored
  single-arm policy predated the public upcoming tier shipped in 5cdbe9c and
  would have made it unreachable in database mode.)

## Recovery implications

Do not drop evidence or candidate links to roll back. If 033 must be disabled,
first stop approval/lifecycle callers, restore the previously reviewed RPC and
policy definitions in a forward migration, and retain the audit/candidate
lineage. The `NOT VALID` constraint and publication trigger can be removed
without deleting rows, but removing them reopens the direct-publication risk.

## Apply-time checks still required

Static tests cannot compile this DDL. Before approval, replay 001–033 in a clean
Supabase branch and test upgrade from the recorded production shape. Exercise:

1. unrelated ID collision and concurrent claims;
2. exact approval retry;
3. confirmed current, ongoing and future approvals;
4. expired and needs-verification rejection;
5. deferred 032 lineage at commit;
6. legacy confirmed/unconfirmed public rows through RLS; and
7. anon/authenticated denial plus service-role execution.
