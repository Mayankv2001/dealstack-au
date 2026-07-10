# PLAN-url-trust-boundaries - Lock down public links and monitor egress

> **Status: Shipped in the 2026-07-10 production-readiness audit.**

> **Rank: 3 of 5. Execute after live-data trust.** Verified against `main` at
> `f65c951`. Most admin editors use `URL.canParse()`, which accepts schemes such
> as `javascript:`, `data:`, `file:`, and credential-bearing URLs. Those values
> flow into public `<a href>` attributes. More importantly, a feed source only
> needs `source_type='ozbargain'` to pass the fetch-type gate; its URL is not
> constrained to an approved HTTPS host, and `fetchFeed()` follows redirects.
> A mistaken or compromised configuration can make the server request an
> arbitrary target. Card readiness is the lone path that already requires HTTPS.

## Goal

Define and enforce one URL policy at every write, read, render, and outbound
request boundary:

- public external links: absolute HTTPS, no embedded credentials;
- internal links: root-relative paths only, never protocol-relative `//...`;
- monitor feeds: HTTPS plus a source-type-specific hostname allowlist, checked
  before every request and after every redirect;
- store logo assets: local `/logos/...` paths only;
- legacy unsafe persisted URLs: never rendered or fetched, and surfaced to the
  admin data-quality report for repair.

No HTML scraping, broad web proxy, user-supplied fetch endpoint, or RLS change is
allowed.

## Exact Files To Touch

| File | Required change |
|---|---|
| `lib/security/urlPolicy.ts` | New pure URL policy, approved feed-host registry, and redirect resolver |
| `lib/offers/cardReadiness.ts` | Reuse shared HTTPS validation instead of its private implementation |
| `app/admin/(protected)/signals/actions.ts` | Require safe HTTPS source/merchant/product URLs |
| `app/admin/(protected)/cashback/actions.ts` | Require safe HTTPS citation URL |
| `app/admin/(protected)/points/actions.ts` | Require safe HTTPS citation URL |
| `app/admin/(protected)/gift-cards/actions.ts` | Require safe HTTPS citation and detail URLs |
| `app/admin/(protected)/weekly-deals/actions.ts` | Require safe HTTPS citation URL |
| `app/admin/(protected)/card-offers/actions.ts` | Use shared validation for draft input; retain readiness enforcement on publish |
| `app/admin/(protected)/signals/sources/actions.ts` | Validate source type and approved feed URL together before save/enable |
| `app/admin/(protected)/stores/actions.ts` | Restrict `logo_path` to a safe local logo path |
| `lib/admin/repos/feedSources.ts` | Recheck persisted feed URL/type before returning a fetchable source |
| `lib/monitor/runMonitor.ts` | Carry source type into the network boundary |
| `lib/monitor/fetchFeed.ts` | Validate initial URL and every redirect; cap redirects; never auto-follow an unvalidated location |
| `lib/repos/offers.ts` | Defensively remove unsafe legacy citations/detail URLs and exclude signals with unsafe required source URLs |
| `lib/repos/sourceResults.ts` | Never emit a source card with an unsafe persisted URL |
| `lib/repos/topDeals.ts` | After Plan 1, require the approved signal URL to pass shared policy |
| `lib/offers/weeklyPicks.ts` | Drop unsafe legacy citations/links before card construction |
| `components/WeeklyDealCard.tsx` | Final render-level guard for citations/detail/retailer/source links |
| `components/SourceResultCard.tsx` | Final render-level guard for View source |
| `components/SignalDealCard.tsx` | Final render-level guard for signal source |
| `components/CardOfferCard.tsx` | Final render-level guard while preserving readiness semantics |
| `lib/admin/repos/dashboard.ts` | Add data-quality flags for unsafe persisted public URLs and unsafe feed URLs |
| `tests/admin/urlPolicy.test.ts` | Pure scheme, credential, path, host, and redirect tests |
| `tests/admin/cardOfferReadiness.test.ts` | Confirm shared helper preserves card readiness behaviour |
| `tests/monitor/fetchFeed.test.ts` | Initial URL and redirect egress tests |
| `tests/monitor/runMonitor.test.ts` | Source-type wiring and unsafe-feed fail-closed tests |
| `tests/stack/weeklyPicks.test.ts` | Unsafe legacy citation filtering |
| `tests/stack/sourceResultsTrust.test.ts` | Unsafe persisted source result exclusion |
| `FINAL-LAUNCH-CHECKLIST.md` | Add unsafe-URL data-quality and egress checks |
| `docs/ozbargain-monitoring.md` | Document approved feed hosts and redirect policy |
| `PROJECT_STATE.md` | Record the URL/egress trust boundary |

If a listed component already receives only a branded safe URL after Plans 1-2,
keep the final render guard anyway: defence in depth prevents a future mapper
from turning persisted legacy data into a clickable unsafe scheme.

## Implementation Order

1. Create `lib/security/urlPolicy.ts` with no React/Next/DB imports. Export:

   ```ts
   export function safeHttpsUrl(value: string): string | null;
   export function safePublicHref(value: string): string | null;
   export function safeLogoPath(value: string | null): string | null;
   export function isApprovedFeedUrl(
     sourceType: string,
     value: string
   ): boolean;
   export function resolveApprovedFeedRedirect(
     sourceType: string,
     currentUrl: string,
     location: string
   ): string | null;
   ```

   `safeHttpsUrl` parses with `new URL`, requires `https:`, non-empty hostname,
   empty username/password, and returns canonical `url.href`. Reject whitespace
   control characters before parsing. `safePublicHref` also permits one leading
   `/` but rejects `//`, backslashes, and path traversal segments. `safeLogoPath`
   permits only `/logos/<filename>` with no `..`, query, fragment, or backslash.

2. Define the monitor allowlist next to the helper, keyed by the existing
   `FeedSourceType`. Initially only `ozbargain` is fetch-approved, with exact
   hostnames `ozbargain.com.au` and `www.ozbargain.com.au`. Host matching is
   lowercased exact match, not suffix matching (`evilozbargain.com.au` and
   `ozbargain.com.au.attacker.test` must fail). Reject IP literals, localhost,
   ports other than implicit 443, credentials, and non-HTTPS schemes.

3. Replace `URL.canParse()` in every listed admin action with the shared helper.
   Parse `source_type` before validating a feed URL so the pair is checked
   together. Draft card offers may keep a blank source URL, but a non-blank value
   must be safe HTTPS; publish readiness still requires it to be present.

4. Keep validation at the monitor boundary even after write validation:

   - extend `MonitorFeed` with `sourceType`;
   - select/map `source_type` in `listDueEnabledFeeds`;
   - if an enabled fetch-approved row has an unapproved URL, fail the selection
     with a stable configuration error before any network call;
   - pass `sourceType` into `fetchFeed`.

   This protects legacy rows and direct DB edits.

5. Replace `redirect: "follow"` in `fetchFeed` with explicit redirect handling:

   - make one request with `redirect: "manual"`;
   - for 301/302/303/307/308, read `Location`, resolve relative to the current
     URL, and call `resolveApprovedFeedRedirect`;
   - reject a missing, malformed, non-HTTPS, credential-bearing, port-changing,
     or non-allowlisted redirect as `blocked`;
   - follow at most three approved redirects, reapplying timeout/headers and URL
     validation each time;
   - detect loops by canonical URL set;
   - preserve conditional headers and the identifying User-Agent;
   - do not include a response body or target URL containing credentials in an
     error message.

6. Defensively sanitize reads:

   - filter each `Citation` through `safePublicHref` (root `/` remains valid for
     the internal manual citation); drop unsafe citation entries;
   - turn unsafe optional detail/merchant/product URLs into `null`;
   - exclude a DB signal/source result/top-deal candidate when its required
     external source URL is unsafe;
   - card offers remain excluded by `isPublicReadyCardOffer`;
   - do not substitute a generic homepage for unsafe real rows, because that
     would conceal the data-quality fault.

7. Add a final render guard. Compute the safe href before rendering an anchor;
   when null, omit the link or render the existing non-clickable source label.
   Never use `href="#"` as a fallback for unsafe data.

8. Extend data quality with actionable flags containing the table/id/edit link
   but never the full unsafe URL in public logs. Cover required source URLs,
   citation arrays, optional detail URLs, store logo paths, and feed URL/type
   pairs. The admin page may display a shortened hostname/scheme to aid repair;
   do not render it as a link.

9. Add focused tests:

   - valid HTTPS and canonicalization;
   - reject `http`, `javascript`, `data`, `file`, `ftp`, protocol-relative,
     credentials, control characters, malformed URLs, non-443 explicit ports;
   - local `/` and `/resources` allowed; `//evil.test`, `/../x`, and backslashes
     rejected;
   - `/logos/myer.png` allowed; external/logo traversal rejected;
   - exact OzBargain hosts allowed, lookalike/subdomain/IP/localhost rejected;
   - relative same-host redirect allowed;
   - cross-host, HTTPS-to-HTTP, loop, missing Location, and fourth redirect
     blocked before the injected fetch is called again;
   - unsafe persisted signals/source cards do not reach public result arrays;
   - unsafe optional citations are dropped without hiding an otherwise valid
     offer;
   - existing card readiness HTTPS tests stay green.

10. Run Node 20 quality and a structural egress audit:

    ```bash
    npm run lint
    npm run test:monitor
    npm run test:stack
    npm run test:admin
    npm run build
    rg 'URL\.canParse' app/admin lib
    rg 'redirect: "follow"' lib/monitor
    git diff --check
    ```

    The first two `rg` commands must have zero matches unless an explicitly
    documented non-public, non-network use remains.

## Edge Cases A Weaker Model Would Miss

1. **Parseable does not mean safe.** `URL.canParse("javascript:...")` is true.
   Protocol and credentials are separate policy checks.
2. **Write validation alone is insufficient.** Existing DB rows, seed data, or a
   direct SQL edit can bypass forms. Repositories, renders, and the network
   boundary all need defensive checks.
3. **Source type is not a host allowlist.** A row labelled `ozbargain` can
   currently point anywhere. Validate the pair.
4. **Automatic redirects reopen SSRF.** An allowlisted initial URL can redirect
   to a private host. Every hop must be manually resolved and revalidated.
5. **Suffix hostname checks are unsafe.** Use exact canonical hostnames. A future
   approved subdomain must be added explicitly after compliance review.
6. **Relative redirect locations are legitimate.** Resolve them against the
   current approved URL before validating; do not reject all relative Location
   headers.
7. **Do not silently downgrade to HTTP.** HTTPS -> HTTP redirects are blocked,
   even on the same hostname.
8. **Internal hrefs and external hrefs have different policy.** The stack
   engine's manual citation `/` is valid; protocol-relative `//host` is external
   and must fail.
9. **Unsafe optional link versus required source.** Drop an optional citation or
   detail link while retaining the offer. Exclude rows whose required source URL
   cannot be safely verified.
10. **Error messages can leak sensitive URL parts.** Never echo credentials,
    query tokens, or full internal targets into cron JSON or client-visible
    errors.
11. **Admin trust does not remove SSRF risk.** Typos, copied URLs, compromised
    credentials, and legacy rows still cross a server egress boundary.
12. **Do not break fixture tests by hard-coding production hosts in pure parser
    tests.** URL policy belongs at source registration/monitor fetch boundaries;
    XML parsing can continue accepting example fixture links offline.
13. **Do not broaden approved feed types.** Point Hacks, FreePoints, GCDB,
    provider-feed, and manual-url remain registry-only.
14. **Source URL validation is not content verification.** HTTPS proves safe
    navigation/transport shape, not that an offer is true; confidence/readiness
    gates remain intact.

## Acceptance Criteria

- [ ] Every admin-managed public URL rejects unsafe schemes and credentials with
      a friendly field error; card readiness behaviour is unchanged.
- [ ] An enabled feed whose type/host pair is not allowlisted causes zero
      outbound requests and a visible configuration failure.
- [ ] Every redirect hop is manually validated; cross-host/downgrade/loop/limit
      cases are blocked.
- [ ] Unsafe legacy required URLs do not render publicly; unsafe optional links
      are removed and flagged for admin repair.
- [ ] No public component creates an anchor from an unvalidated persisted URL or
      falls back to `#`.
- [ ] Data-quality report identifies affected records without making unsafe URLs
      clickable or logging secrets.
- [ ] No new feed type, RLS policy, migration, cron schedule, scraping, or
      browser-facing service-role code is introduced.
- [ ] Full Node 20 quality gate, structural `rg` checks, and `git diff --check`
      pass.
