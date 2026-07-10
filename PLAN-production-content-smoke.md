# PLAN-production-content-smoke — Add strict public-content smoke checks

> **Rank: 4 of 5.** The existing `npm run smoke` is good at route, SEO endpoint, auth boundary, and security-header checks. It does not catch the product-trust regressions this repo has repeatedly hit: placeholder copy on public pages, static/demo data served from a configured production DB, or source-result paths leaking expired/unready rows. After Plans 1 and 2, encode those as a repeatable smoke gate.

## Goal

Extend `scripts/smoke-routes.ts` with an opt-in strict content mode that can run against local or production URLs and fail when public pages contain known demo/trust markers.

Strict mode should be read-only and should fetch only fixed DealStack routes.

## Exact Files To Touch

| File | Change |
|---|---|
| `scripts/smoke-routes.ts` | Add `--strict-content`; fetch fixed public routes and assert no banned public markers |
| `FINAL-LAUNCH-CHECKLIST.md` | Document strict smoke command under public QA / pre-commit gate |
| `README.md` | Add a short command line under Tests or Deployment |
| `tests/admin/placeholderCopy.test.ts` | Add one test that the smoke banned-marker list stays aligned with placeholder concepts, if the list is exported |

Do not make strict mode the default until current prod is clean, or the normal route smoke becomes unusable during cleanup.

## Implementation Order

1. Read `scripts/smoke-routes.ts` fully. Keep its safety model:
   - fixed routes only
   - GET only
   - no crawling links
   - no external hosts
2. Add CLI parsing:
   - `--strict-content` boolean, default false
   - update `--help` output
3. Define strict route set:
   - `/`
   - `/deals`
   - `/cards`
   - `/search?q=qantas`
   - `/search?q=myer`
   - `/stores/myer`
   - `/stores/jb-hifi`
4. Define banned public markers:
   - `Illustrative sign-up bonus`
   - `Illustrative statement credit`
   - `Sample only`
   - `placeholder URL`
   - `lorem ipsum`
   - `Application error`
   - `localhost:3000` when `baseUrl` is not local
5. Add `expectNoPublicTrustMarkers(path)`:
   - Fetch page via existing `fetchWithRetry`.
   - Require status 200 and `text/html`.
   - Fail with route + marker name if any marker appears.
   - Limit body logging; never print full HTML.
6. In `main()`, run these checks only when `strictContent` is true.
7. Update docs:
   - `npm run smoke` remains route smoke.
   - `npm run smoke -- --strict-content --base-url=https://<prod-domain>` is the launch content gate.

## Edge Cases A Weaker Model Would Miss

1. **Strict mode must be opt-in.** Current known prod may still contain illustrative card rows until Plan 1 ships and/or data is cleaned. Do not break the existing smoke command.
2. **Do not ban the word "sample" globally.** The site has legitimate copy like "sample spend" and "free sample" in tests/docs. Use precise public markers such as `Sample only` and `Illustrative`.
3. **Do not fetch admin routes in strict content mode.** The admin checks already verify redirects. Strict content is for public HTML only.
4. **Do not print full response bodies.** Public HTML may include user/content text; log the path and marker only.
5. **Do not check dynamic counts.** Counts change with DB content. Markers are stable and high signal.
6. **Localhost marker is only a production problem.** Keep the existing `isLocal` exception pattern.

## Acceptance Criteria

- [x] `npm run smoke` behaviour is unchanged without `--strict-content`.
- [x] `npm run smoke -- --help` documents strict mode.
- [x] `npm run smoke -- --strict-content` fails if a checked public page contains `Illustrative sign-up bonus`.
- [x] Against a clean local/prod build, strict mode passes without crawling external links.
- [x] `FINAL-LAUNCH-CHECKLIST.md` names strict smoke as the automated check for "No placeholder / Illustrative copy remains public".
- [x] `npm run lint` and `npm run build` pass.

## Status: Shipped 2026-07-10

`scripts/smoke-routes.ts` gained `--strict-content` (opt-in, default off) which
GETs `/`, `/deals`, `/cards`, `/search?q=qantas`, `/search?q=myer`,
`/stores/myer`, `/stores/jb-hifi` and fails on any of `Illustrative sign-up
bonus`, `Illustrative statement credit`, `Sample only`, `placeholder URL`,
`lorem ipsum`, `Application error`, `Expired / unknown` (the exact
ConfidenceBadge label for a leaked expired-unknown source result), or a
`localhost:3000` leak on a non-local base URL. The file's CLI-only side
effects (`--help`'s `process.exit`, `main()`'s network calls) are now gated
behind an `isMainModule` check so `STRICT_CONTENT_BANNED_MARKERS` and
`expectNoPublicTrustMarkers` are safely importable — used by a new alignment
test in `tests/admin/placeholderCopy.test.ts` confirming every placeholder/demo
marker in the banned list is also caught by `findPlaceholderMarkers`. Verified
manually against a running `next start` server (clean pass) and via a stubbed
`fetch` harness (confirms it fails on `Illustrative sign-up bonus`).
Documented in `FINAL-LAUNCH-CHECKLIST.md` §7 and §11, and in `README.md`
under Tests.

