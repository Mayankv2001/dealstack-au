# Cashback Portal Source Policy — ShopBack & TopCashback

## Current state (verified this phase)

`cashback_offers` already fully supports the two permitted cashback portals,
end to end:

- **Schema-level guarantee:** the `provider` column has a DB `CHECK`
  constraint limited to exactly `'ShopBack'` and `'TopCashback'`
  (`supabase/migrations/001_initial_schema.sql`) — a third provider (including
  Cashrewards) is structurally impossible to insert, not just a convention.
- **Admin CRUD:** `lib/admin/repos/cashback.ts` (service-role only) +
  `app/admin/(protected)/cashback/{page.tsx,new/page.tsx,[id]/edit/page.tsx}`,
  every write behind `requireAdmin()` + rate limiting + `logAudit()`.
- **Admin copy already states the policy correctly** — no changes needed:
  - `/admin/cashback/new`: *"ShopBack or TopCashback only. Manual entry — no
    scraping, no external source requests."*
  - `/admin/cashback` (list): *"ShopBack & TopCashback only — manual entry.
    Drafts are listed here but hidden from /deals until published."*
- **Publish gate:** `is_published` boolean, defaults per-row; drafts are
  admin-only until explicitly published; RLS enforces the anon read filter at
  the DB layer regardless of application code.
- **Public rendering:** `/deals`, the stack calculator, and store pages — all
  already live.

**Cashrewards audit:** grepped the full repo (case-insensitive "cashrewards")
and reviewed every hit. Every occurrence is either (a) a code comment
explaining *why* it's excluded (`lib/admin/repos/cashback.ts`,
`components/admin/CashbackForm.tsx`, `lib/repos/sourceResults.ts`,
`scripts/seed-offer-changes.ts`), (b) a policy statement in `README.md` /
`CLAUDE.md` / this expansion's docs, (c) a test asserting the taxonomy never
contains it (`tests/monitor/dealCategories.test.ts`), or (d) one admin
dashboard tile description confirming the exclusion (`app/admin/(protected)/
dashboard/page.tsx`: *"ShopBack & TopCashback offers (no Cashrewards)."*).
None integrate with, link to, or import data from Cashrewards — every hit is
the codebase correctly documenting that it's excluded.

## Source policy (binding)

### What is allowed

- **Manual admin entry** of a ShopBack/TopCashback rate, read by a human from
  either portal's own public rate page (no login required to view current
  published rates on either site) or a payout confirmation the admin has
  personally seen.
- **OzBargain community posts that mention a ShopBack/TopCashback rate boost**
  (e.g. "TopCashback: 100% New Customer Bonus" — already flowing through the
  existing, approved OzBargain RSS pipeline and already tagged `preferred` by
  the feed classifier as of this expansion) — an admin may read one of these
  staged `feed_items` rows as a **prompt** to go check and manually update the
  rate. The feed item itself is never applied automatically.

### What is **not** allowed

- ❌ Scraping ShopBack's or TopCashback's site (HTML scraping, automated
  crawling, or any request pattern beyond a human opening the page in a
  browser). Both are commercial portals likely to have anti-bot/rate-limit
  protections and ToS restrictions on automated access — out of scope,
  full stop, per the platform-wide no-scraping rule.
- ❌ Any fetcher, cron job, or scheduled task targeting either portal. None
  exists today and none should be added without a full compliance review
  matching the rigor already applied to the OzBargain feed pipeline
  (`docs/ozbargain-monitoring.md`) — robots.txt, ToS review, rate ceiling,
  identifying User-Agent, kill switches. **Not proposed or started here.**
- ❌ Auto-applying a detected rate change. Even if a future OzBargain-post
  detector were built, it would only ever **stage** a proposed change.

### Rate-change staging path (schema exists, not wired up)

Confirmed in Phase 1 research: `lib/monitor/offerChanges.ts` already maps a
`cashback` `source_type` candidate onto `{table: "cashback_offers", column:
"rate_percent"}`, and `source_name` is free text (already used for
`"ShopBack"`/`"TopCashback"` in migration comments) — so the
`offer_change_candidates` table can represent a ShopBack/TopCashback rate
change today **without any schema change**. The review UI
(`/admin/offer-changes`) is a genuine diff (previous → proposed) with three
actions: **Apply**, **Ignore**, **Mark duplicate** — Apply is the only action
that mutates the live `cashback_offers` row, and it is entirely manual
(client-side `window.confirm()` + server-side re-validation).

**What's missing is a detector** — nothing currently calls
`insertOfferChangeCandidates()` (confirmed: zero call sites outside the dev
seed script `scripts/seed-offer-changes.ts`). Building one is explicitly
**out of scope for this phase**. If built later, it must:

1. Only read the already-approved OzBargain feed (`feed_items`) — never fetch
   ShopBack/TopCashback directly.
2. Only **stage** a candidate row — never call `applyOfferChange()` itself.
3. Require the existing admin **Apply** action for any live rate to change.

## Summary

No code changes were needed this phase — the existing cashback implementation
already satisfies every rule above. This document exists so the policy is
written down in one place rather than only implied by the code, and so a
future rate-change detector (if ever built) has an explicit spec to follow.
