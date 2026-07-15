# TASK-35 — Source-sweep presence detection for reconciliation

## Goal
Make `source-unavailable` and `withdrawn` reconciliation outcomes reachable
from real stored run state without treating an intentionally closed source as
missing.

## Root cause
The stored reconciliation loader sees the latest payload for each raw item,
but has no completed-run membership snapshot. An offer omitted from a newer
permitted source run therefore retains its previous extraction and cannot be
distinguished from a source item that was seen again.

## Scope
- Record a bounded source-item membership manifest/hash for each completed,
  successful permitted ingest run, without storing copied editorial content.
- Compare the last two successful runs for the same source.
- Emit disappearance only after a successfully parsed source sweep; fetch or
  parse failure remains `source-unavailable` and never expires/unpublishes.
- An explicit source removal marker remains `withdrawn`.
- Closed or permission-incomplete sources produce no disappearance outcome.
- Stage private review/audit only; never mutate public offers directly.

## Required tests
Seen-again; omitted-after-success; explicit withdrawal; partial/failing sweep;
closed source; first run; idempotent rerun; multi-source isolation; no copied
body stored; no public write.

## Safety
Any new schema is additive/default-deny and remains unapplied. Do not fetch,
enable sources, commit, push, deploy, or change production data.
