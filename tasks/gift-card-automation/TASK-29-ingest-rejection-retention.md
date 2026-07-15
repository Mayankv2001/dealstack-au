# TASK-29 — Ingest rejection retention and parser-failure audit

## Goal
Ensure the TASK-01–07 ingestion foundation retains attributable structured
source items that fail extraction and records parser failures distinctly,
without storing full copyrighted pages or exposing private data.

## Root cause
`runGiftCardIngest` extracts before inserting a new raw item. An extraction
failure increments run metrics but drops the parsed source item, and a
non-empty response that parses to zero items can be reported as a successful
empty run. The run error summary alone does not preserve item attribution for
admin-assisted recovery.

## Scope
- Add a dependency-injected rejected-item persistence path storing the bounded
  parsed item, source ID/URL, retrieval timestamps, content hash/parser version,
  `processing_status='rejected'` and bounded `parser_error`.
- Treat a non-empty source response that yields no parseable items as a parse
  failure, not a successful source disablement or confirmed absence.
- Preserve the existing copyright boundary: never store full HTML/article
  bodies, images, comments or raw feed prose beyond current bounded fields.
- Make retries idempotent on `(source_id, external_id)` and allow a corrected
  later parse to move the stored item to `parsed` through the existing path.
- Add focused unit/repo tests for invalid, partial and retry cases.

## Acceptance criteria
- Invalid/incomplete source items fail closed and never stage/publicise.
- A rejected item remains attributable and reviewable with retrieval metadata.
- Source unavailable, parse failure and source disabled remain distinct.
- Parser failures are visible in run metrics/error summary.
- No public policy or automation gate changes.

## Safety
No migration apply, production access, source enablement, commit, push or
deployment.
