# DealStack AU — Release roadmap

> Generated 2026-07-13. 20 iterations → 4 milestones. Iteration numbering is the
> **recommended execution order**; milestones are thematic completion markers, so
> a milestone can span non-contiguous iterations (security runs early because it
> protects everything after it). Full per-iteration detail (objective, tickets,
> prerequisites, expected files, tests, manual checks, stop condition, approval,
> rollback) lives in the `iterations` array of
> [DEALSTACK-BACKLOG.json](DEALSTACK-BACKLOG.json); this file is the narrative view.

## Milestone map

| Milestone | Iterations | Theme | Exit criteria |
|---|---|---|---|
| **M1 — Accurate gift-card production data** | IT-01 → IT-04 | Fix what is live | Every published row verified and constraint-protected; CI covers all suites; docs truthful |
| **M2 — Rich gift-card intelligence** | IT-09, IT-12 → IT-16 | Depth: compound campaigns, products, rules, stack | Detail pages answer the eight buyer questions from real data; stack and detail never disagree |
| **M3 — Safe automated operation** | IT-05 → IT-08, IT-17 | Harden, observe, then switch on | Recurring ingestion live with two healthy observed runs; weekly security probes green |
| **M4 — Scale and growth** | IT-10, IT-11, IT-18 → IT-20 | Polish and evidence-gated growth | Growth ships only where trust prerequisites are met |

## Iterations at a glance

| # | Name | Tickets | Approval? | Stop condition (abridged) |
|---|---|---|---|---|
| IT-01 | Production data truth | DS-005, 001, 002, 003, 004, 006 | **Yes — row-level** | 13 rows verified/corrected/unpublished; strict smoke green |
| IT-02 | Queue clearance & doc truth | DS-007, 010, 011, 102 | **Yes** (data) | Queue empty/deferred; stale docs fixed |
| IT-03 | CI, validation & fixture hardening | DS-090, 097, 098, 099, 093, 096, 091 | No | CI runs all 5 suites; validate:all green; real fixture committed |
| IT-04 | Ongoing-state migration | DS-008, 089, 009 | **Yes — migration** | 023 applied+probed; constraint validated; flags live |
| IT-05 | Security probes & hygiene | DS-079, 080, 085, 081, 083, 084, 082 | **Yes** (CSP flip only) | Probes green vs prod; shared bearer helper everywhere |
| IT-06 | Ingestion hardening | DS-041, 042, 043, 045, 047, 044 | **Yes** (044 column) | All hardening DI-tested; gates stay closed |
| IT-07 | Ops visibility | DS-071, 074, 072, 073, 075, 076, 077 | No | Status card, health signals, runbook, emergency stop shipped |
| IT-08 | Admin review scaling | DS-050, 051, 052, 054, 056, 057 | No | Diffs, in-queue dedupe, reasons, bulk tools live |
| IT-09 | Stack-engine truth | DS-058, 059, 060, 061, 062 | No | Cross-surface consistency test green |
| IT-10 | Public polish & accessibility | DS-064, 065, 066, 067, 068, 094 | No | axe gate green; JSON-LD validated |
| IT-11 | Public UX depth | DS-069, 070, 092, 095 | No | Mobile drawer + comparison live; degraded e2e green |
| IT-12 | Compound-campaign foundation | DS-012, 013, 020, 086 | **Yes — ADR + migration** | ADR approved; schema applied+probed; RPC tests green |
| IT-13 | Multi-candidate ingestion | DS-014, 018, 019, 053 | No | Compound fixture round-trips; idempotency re-proven |
| IT-14 | New mechanics & compound completion | DS-015, 016, 017, 063, 021 | **Yes** | Amazon row split; no row spans mechanics |
| IT-15 | Product & acceptance foundation | DS-022, 023, 024, 025, 026, 055 | **Yes** (data entry) | Products cited and linked; acceptance renders |
| IT-16 | Product rules & detail depth | DS-030, 031, 032, 033, 034, 027, 028 | **Yes** (migrations) | Worked examples cap/denomination-aware |
| IT-17 | Recurring ingestion activation | DS-049, 046, 078, 087, 088 | **YES — Phase 8 enable** | Two healthy scheduled runs observed post-enable |
| IT-18 | Programme catalogue foundation | DS-035, 036, 038, 037, 039 | **Yes** | NRMA/RACV modelled honestly; no fake ongoing offers |
| IT-19 | Community input & audit tooling | DS-103, 100, 101, 029 | **Yes** (103 migration) | Report flow live; audit script reproduces §J findings |
| IT-20 | Future research & scale decisions | DS-040, 048, 104, 105, 106, 107, 108 | No (decisions only) | Every memo delivered with a recorded user decision |

Every iteration ends with its validation gate: the ticket-level `validation`
commands plus, for any iteration touching product source, `npm run lint`,
`npx vitest run`, `npm run build` (and `npm run test:e2e` where public UX moved).
Iterations marked **Yes** stop dead at their approval point — see
[OPUS-EXECUTION-GUIDE.md](OPUS-EXECUTION-GUIDE.md).

## Focused lists

### Top 10 highest-priority tickets
1. **DS-001** — expiry re-verification sweep (the live accuracy debt)
2. **DS-005** — the two offers expiring 2026-07-13 / 07-15 (time-critical)
3. **DS-004** — Apple duplicate resolution (double-publish risk sitting in the queue)
4. **DS-003** — mis-typed 0%-discount points rows
5. **DS-090** — CI does not run test:giftcards/test:deals (open regression door)
6. **DS-007** — 15 unreviewed candidates aging in the queue
7. **DS-079** — RLS assertion probe (converts the core trust boundary into a tested invariant)
8. **DS-058** — stack vs detail-page stackability disagreement (false-compatibility class)
9. **DS-008** — persist the reviewed 'ongoing' state (unblocks the integrity constraint)
10. **DS-091** — real feed fixture (de-risks the whole compound-campaign design)

### Top 10 highest-risk tickets (handle with extra care)
DS-013 (compound schema — high, shapes everything after it) · DS-036 (programme schema — high) · DS-105 (alerts — XL, drags in accounts/email) · DS-021 (production split of a live row) · DS-089 (DB constraint on live data) · DS-008 (RPC-touching migration) · DS-082 (CSP flip can break rendering site-wide) · DS-049 (touches production gates by design) · DS-044 (auto-pause could silence a healthy source if mis-tuned) · DS-060 (changes user-visible savings maths).

### Top 10 quickest wins
DS-090 (XS, closes the CI gap) · DS-098 (XS, ends the wrong-Node trap) · DS-005 (XS, decision + note) · DS-004 (XS decision) · DS-006 (XS re-verify) · DS-093 (S, DST tests) · DS-061 (S, points/cash tripwire) · DS-047 (S, hostile fixtures) · DS-074 (S, expiring digest — query already exists) · DS-064 (S, JSON-LD from existing components).

### Top 10 for Codex (clear implementation, low ambiguity)
DS-090, DS-047, DS-093, DS-096, DS-061, DS-051, DS-050, DS-064, DS-068, DS-074. (Next tier: DS-052, DS-045, DS-041, DS-085, DS-098.)

### Top 10 needing Opus-level architectural work
DS-012 (compound ADR), DS-013 (schema), DS-014 (extraction contract), DS-058 (stack integration), DS-022 (product CRUD design), DS-035 (programme ADR), DS-086 (DB test harness), DS-099 (migration tooling), DS-019 (split UI), DS-082 (CSP evaluation).

### Tickets requiring human production approval (33)
DS-001, 002, 003, 004, 005, 006, 007, 010 (data edits) · DS-008, 013, 015, 016, 030, 031, 036, 044, 046, 087, 089, 103 (migration applies) · DS-020, 021, 023, 024, 025, 026, 037 (production data operations) · DS-049, 078, 082 (production behaviour/ops) · DS-105, 106, 107 (growth decisions).

### Tickets blocked by migration 022
**None.** Migration 022 is applied to production and verified (handoff §D); its columns are live and empty. Corrections that use them (DS-001, DS-002) are gated on **data review**, not schema.

### Tickets blocked by data review
DS-089 (needs DS-001's zero-violator sweep) · DS-021 (needs DS-005's decision) · DS-025/DS-026 (need DS-023/DS-024 human data) · DS-037 (needs verified rates) · DS-027/DS-029/DS-033 (need DS-026 data).

### Tickets that should not be attempted yet
DS-105/DS-106/DS-108 (design-first, trust milestones incomplete) · DS-063 (mechanics don't exist yet) · DS-021 (pipeline can't split yet) · DS-048/DS-104 (no second source vetted) · DS-040 (research slot, low urgency) · DS-037 (schema doesn't exist). All carry status `blocked` or `future` in the backlog.

## Recommended first iteration

**IT-01 — Production data truth.** It is the highest-priority work, requires no
code, unblocks DS-089, feeds DS-021, and its stop condition (every published row
verified) is the precondition for calling anything else "accurate". DS-005's
dates make it time-critical: two rows expire within days of this document.
An agent-only alternative for the same session is IT-03 (CI/fixtures), which
needs no approvals and can run in parallel with the human data pass.
