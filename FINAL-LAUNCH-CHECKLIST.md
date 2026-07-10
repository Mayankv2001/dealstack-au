# DealStack AU — Final Launch Checklist

> Concise, repo-accurate go-live checklist. Verified against the codebase on
> 2026-07-10 (HEAD `1c8a20c`). Work top to bottom; nothing here auto-applies.
> For the full narrative runbook see [`docs/production-readiness.md`](docs/production-readiness.md);
> this file is the condensed pre-flight pass.
>
> House rules that must survive launch: no auto-publish (all feed/offer changes
> are admin-reviewed), monitor/cron never writes `ozbargain_signals`, RSS/Atom
> feeds only (no scraping), service-role key stays server-side, Australian
> spelling + AUD formatting, no Cashrewards references.

---

## 1. Environment variables (Vercel → Settings → Environment Variables)

**Required (all environments):**
- [ ] `NEXT_PUBLIC_SUPABASE_URL` — project URL (safe to expose; RLS-limited)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key (safe to expose)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, bypasses RLS; never prefix `NEXT_PUBLIC_`
- [ ] `NEXT_PUBLIC_SITE_URL` — `https://<prod-domain>` — **launch-critical**: sitemap, robots, canonical, OG image URLs and all JSON-LD fall back to `http://localhost:3000` if unset (`lib/env.ts` `siteUrl()`). Verify in §8.
- [ ] `CRON_SECRET` — long random string (`openssl rand -hex 32`); the cron route returns **503 and never runs** if unset. Server-only.

**Only when enabling the feed monitor (post-compliance, see §4):**
- [ ] `OZB_MONITOR_ENABLED=true` — master kill switch (defaults off)
- [ ] `OZB_MONITOR_USER_AGENT` — identifying UA with contact URL; never a spoofed browser string
- [ ] `OZB_MONITOR_MAX_FEEDS_PER_RUN` (default 1), `OZB_MONITOR_MIN_INTERVAL_HOURS` (default 12) — optional caps

**Leave OFF for launch:**
- [ ] `OZB_OFFER_DETECT_ENABLED` — offer-change detection; keep unset/`false` until precision is reviewed (§4)

**Notes:**
- `DATA_SOURCE` optional (`supabase` default; set `static` only to force the fallback dataset).
- `ADMIN_EMAILS` appears in `.env.example` but is **not consumed by current code** — admin access is governed solely by the `admins` table (§2). Setting it has no effect.
- [ ] Confirm no real secret values are committed anywhere (`.env.local` is gitignored).

---

## 2. Supabase production checks

- [ ] RLS enabled on every public-facing table (`stores`, `cashback_offers`, `gift_card_offers`, `points_offers`, `ozbargain_signals`, `weekly_deals`, `card_offers`).
- [ ] Staging tables (`feed_items`, `feed_sources`, `feed_fetch_log`, `offer_change_candidates`) have **no public read policy** (service-role only).
- [ ] Admin allowlist: at least one row in `admins` for each operator email — this is the source of truth (`requireAdmin()` → `.from("admins")`).
- [ ] **New admins:** because magic-link sign-in uses `shouldCreateUser: false`, create each admin's Supabase Auth user **by hand** (Dashboard → Authentication → Add user) *before* first login — the `admins` row alone is not enough, or the magic link silently fails.
- [ ] Service-role key rotated/known-good and set only in Vercel + local scripts (never client-exposed).

---

## 3. Migrations applied (in order, idempotent)

- [ ] 001 `initial_schema` · 002 `feed_import_queue` · 003 `compliance_review` · 004 `offer_change_candidates` · 005 `feed_item_homepage_hidden` · 006 `admin_rate_limits` · 007 `card_offers` · 008 `pin_function_search_path`
- [ ] **All 8** present in Supabase (`supabase db push` or SQL editor). Some prod migrations were historically hand-applied and drifted, so run `npm run verify:schema` — it probes the live project for every table/column the migrations declare and fails loudly on any gap.
- [ ] Spot-check the columns added by later migrations exist: `feed_items.hidden_from_homepage` (005), `admin_rate_limits` table (006), `card_offers` table (007) — `npm run verify:schema` covers all three.
- [ ] 008 pins `set_updated_at()`'s search_path (no schema shape change) — clears the Supabase advisor WARN `function_search_path_mutable` (lint 0011). Re-run `get_advisors` after applying to confirm the WARN is gone.
- [ ] **Scheduled watchdog:** `.github/workflows/schema-drift.yml` re-runs the probe every Monday 21:00 UTC and on manual dispatch (Actions → Schema drift → Run workflow, `main` only). One-time setup: add repository Actions secrets `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; until they exist, runs stay red with exit 2 (a blind watchdog must never look green). Exit 1 = real drift — review and hand-apply the named migration; nothing is ever auto-applied. Adding a migration without updating `scripts/schema-manifest.ts` fails `npm run test:admin` (manifest self-audit), so probe coverage can't silently lag.
- [ ] Ensure the repository owner receives GitHub Actions failure notifications — a scheduled red run nobody sees is not an alert. Note GitHub disables schedules after ~60 days without repo activity; the manual-dispatch pre-launch run doubles as the keep-alive check.

---

## 4. Cron / feed monitor health

- [ ] `vercel.json` cron unchanged at `0 2 * * *` (daily) — Hobby plan allows one/day; **do not** make sub-daily.
- [ ] Monitor gate is fail-closed (verify behaviour, do not change): no `CRON_SECRET` → 503 · bad `Authorization` → 401 · `OZB_MONITOR_ENABLED`≠`true` → 200 `{disabled}` · no approved compliance review → 200 `{blockedByCompliance}` · all pass → write to **staging tables only**.
- [ ] Compliance review approved at `/admin/compliance` **before** setting `OZB_MONITOR_ENABLED=true`.
- [ ] Feed source added + enabled at `/admin/signals/sources`; source type is `ozbargain` (not `manual-url`, or `listDueEnabledFeeds` skips it and `last_fetched_at` never advances).
- [ ] After first run: `/admin/monitor` → Recent fetch runs shows a fetch; `last_fetched_at` advanced.
- [ ] (Optional) external scheduler (cron-job.org) GETs `/api/cron/monitor-feeds` with `Authorization: Bearer $CRON_SECRET` ≤ every 3h.
- [ ] External alert checker GETs `/api/health/monitor` with the same Bearer token every 3h; alert on non-2xx/timeout and verify delivery once with a deliberately wrong token.
- [ ] Keep `OZB_OFFER_DETECT_ENABLED` off until precision is reviewed, then follow the **go-live runbook** in `docs/ozbargain-monitoring.md` (§ Offer-change detection: go-live runbook) — detection only stages candidates for `/admin/offer-changes`, never auto-applies. Post-enable status (flag, per-state counts, last-staged time) is visible on `/admin/monitor`.

---

## 5. Cleanup dry-run / apply process

- [ ] Run dry-run first (default writes nothing): `nvm use 22 && npm run cleanup:old-deals`
- [ ] Review candidates: expired-but-published offers → unpublish; stale `new` feed items (>60d) → ignore.
- [ ] Apply only after review: `npm run cleanup:old-deals -- --write` (every change writes an `audit_log` row).
- [ ] Known items as of 2026-07-10: **two** expired-published gift cards — `gc-tcn-jbhifi` (TCN, expired 2026-07-02) and `gc-woolworths-wish` (Woolworths WISH, expires 2026-07-10 — expired from the 11th). Unpublish via `/admin/cleanup` (the reviewed, audited one-click page — preferred) or the CLI `cleanup --write` / `/admin/gift-cards`. The public read-guard already hides expired offers from actionable listings; this is DB hygiene.
- [ ] Offers intentionally published with **no** `expiry_date` (ongoing card/cashback/points offers) are flagged for manual review but left untouched — confirm they are genuinely open-ended.

---

## 6. Admin data-quality review

- [ ] `/admin/dashboard` loads; data-quality stats render (missing rates, stale data, coverage gaps).
- [ ] Repair every **Unsafe URL** data-quality flag before launch; unsafe public links are hidden and unsafe monitor targets are never fetched.
- [x] `/admin/card-offers` — all 5 rows issuer-verified on 2026-07-10; 1 fixed-expiry offer published, 3 current no-fixed-expiry offers withheld, and 1 obsolete promotion withheld.
- [ ] `/admin/stores` — store metadata correct; remember store `id` is immutable (edit is unpublish-only, no rename).
- [ ] `/admin/signals/queue` — staged items reviewed; use keyword presets + **Ignore visible** for bulk triage (bulk **ignore** only — import is one-at-a-time, nothing auto-publishes).
- [ ] Homepage Top 5 state matrix in staging: import a test item (pending → absent), approve its linked signal (present unless the feed item is hidden), edit the approved title (edited copy appears), then hide/expire the signal (absent). Disable all feed sources, confirm the already-approved card remains present, then restore the reviewed source enablement.
- [ ] `/admin/audit` — append-only log records recent admin actions.
- [ ] Every admin mutation goes through `requireAdmin` → `checkAdminRateLimit` → `logAudit` (per-admin mutation budget backed by `admin_rate_limits`).

---

## 7. Public route QA

Verify each returns 200 with real content (spot-checked green 2026-07-09):
- [ ] `/` homepage (hero + live stack calculator) — automated: `npm run smoke`
- [ ] `/deals` (filters work: All / Best stacks / Gift cards / Points / Cashback / OzBargain signals / Expiring soon) — automated: `npm run smoke` (route renders; filter interactions are still manual)
- [ ] `/stores/[slug]` for major stores (e.g. `/stores/myer`, `/stores/jb-hifi`, `/stores/woolworths`) — automated: `npm run smoke`
- [ ] `/stores` index returns 200, grouped by category, linked from every public page's nav — automated: `npm run smoke`
- [ ] `/search?q=myer` returns results — automated: `npm run smoke`
- [x] `/cards` lists the verified, fixed-expiry Amex offer (unready rows stay absent) — automated: `npm run smoke`
- [ ] `/resources` — automated: `npm run smoke`
- [ ] 404 page (any unknown path) renders branded not-found — automated: `npm run smoke`
- [ ] Error boundary (`app/error.tsx`) present with retry + back-to-home
- [ ] Mobile 375px: no horizontal overflow on `/`, `/deals`, `/cards`, `/stores/*`, `/search`, `/resources`
- [ ] Desktop layout clean
- [ ] All `/admin/*` routes 307-redirect to `/admin/login` when unauthenticated (no data leak) — automated: `npm run smoke`
- [ ] No placeholder/demo copy, expired results, or unready card offers reach a public page — **automated (opt-in, run once against the live prod URL after data cleanup):** `npm run smoke -- --strict-content --base-url=https://<prod-domain>`. Fetches `/`, `/deals`, `/cards`, `/search?q=qantas`, `/search?q=myer`, `/stores/myer`, `/stores/jb-hifi` and fails on any of: `Illustrative sign-up bonus`, `Illustrative statement credit`, `Sample only`, `placeholder URL`, `lorem ipsum`, `Application error`, `Expired / unknown`, or a `localhost:3000` leak. Off by default — plain `npm run smoke` is unaffected.

---

## 8. SEO / sitemap / robots / metadata

- [ ] `https://<prod-domain>/robots.txt` — `Disallow: /admin` and `/api`; `Sitemap:` line points to the **prod** host (not localhost). — automated: `npm run smoke` (checks `Disallow: /admin` and the host/no-localhost assertion on the Sitemap line)
- [ ] `https://<prod-domain>/sitemap.xml` — `<loc>` entries use the prod host; store URLs are `/stores/<id>`. — automated: `npm run smoke` (checks `<loc>`/`/stores/`/`/cards` presence and no-localhost leakage)
- [ ] `/opengraph-image` returns a valid PNG; homepage `og:image` / canonical use the prod host. — automated: `npm run smoke` (checks 200 + `image/*` content-type; PNG-bytes/canonical-tag verification is still manual)
- [ ] JSON-LD present (site-level + store breadcrumb) and emits absolute prod URLs.
- [ ] Root cause to double-check: all of the above derive from `NEXT_PUBLIC_SITE_URL` (§1) — one wrong/missing value breaks every item here.

---

## 9. Security headers

Applied to `/:path*` via `next.config.ts` — confirm present on a prod response:
- [ ] `X-Content-Type-Options: nosniff` — automated: `npm run smoke`
- [ ] `X-Frame-Options: DENY` — automated: `npm run smoke`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` — automated: `npm run smoke`
- [ ] `Permissions-Policy: camera=(), microphone=(), geolocation=()` — automated: `npm run smoke`
- [ ] `Strict-Transport-Security` (HSTS) is present in production — **injected by Vercel at the edge**, not by `next.config.ts` (verified on the live deployment: `max-age=63072000; includeSubDomains; preload`). — automated: `npm run smoke` (warns rather than fails when absent, since it's edge-injected and legitimately missing locally)
- [ ] CSP is intentionally **not** set (documented decision) — do not add during launch without review.

---

## 10. Backup / rollback notes

- [ ] Confirm Supabase automatic backups (PITR / daily) are enabled for the prod project.
- [ ] App rollback: Vercel → Deployments → promote last known-good, or `vercel rollback`.
- [ ] No automatic undo for applied offer changes — the `audit_log` records the previous value; revert manually via the relevant admin page.
- [ ] Emergency monitor disable: set `OZB_MONITOR_ENABLED=false` (redeploy) **or** immediate DB path `UPDATE feed_sources SET is_enabled = false;`.
- [ ] Staging tables are append-only and never touch public offers — a bad cron run cannot break the public site.

---

## 11. Manual content verification

- [ ] Published cashback / gift-card / points / card offers have correct rates and current terms (verify against source before relying on any figure — the site is a research tool, not a checkout).
- [x] No placeholder / "Illustrative" copy remains on card-offer rows. The sole published row is confirmed and public-ready; strict smoke confirms banned trust markers do not reach public pages (§7).
- [ ] AUD amounts and Australian spelling throughout user-facing copy.
- [ ] Homepage OzBargain signals are approved, non-sample and live; cards use the edited signal title/summary/source, never raw `feed_items` copy.
- [ ] Store logos/aliases resolve; featured/popular stores on the homepage look correct.

---

## 12. Post-launch monitoring

- [ ] After the first scheduled cron window, confirm `last_fetched_at` advanced (if monitoring enabled) — the staleness banner on `/admin` and `/admin/monitor` surfaces a stall (>30h).
- [ ] Watch Vercel deployment + function logs for the cron route errors on the first few runs.
- [ ] Re-run the cleanup dry-run periodically to catch newly-expired published offers.
- [ ] Re-check `/admin/dashboard` data-quality after content edits.
- [ ] Confirm public pages still serve the Supabase dataset (not the static fallback) — re-seed if static offer data was edited.

---

### Pre-commit gate (any code change during launch prep)
```bash
nvm use 20
npm run lint && npm run build
npm run test:monitor   # if monitor/feed/ranking logic changed
npm run test:stack     # if stack/calculation logic changed
npm run test:admin     # if admin action/rate-limit/fallback logic changed
```
> Resolved: the former clock-triggered stale-fixture failure in `tests/stack/buildStack.test.ts` is fixed — the stack engine now accepts an injectable `now` clock and the tests pass a fixed `TEST_NOW`, so `npm run test:stack` is deterministic regardless of the real date.

> CI: this same gate (lint, three Vitest suites, build, smoke) now also runs automatically in GitHub Actions on every PR and every push to `main` — no repository secrets required. The local run above stays the fast path; CI is the backstop that catches a skipped or forgotten step.
