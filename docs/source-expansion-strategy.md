# Source & Content Expansion Strategy

> **Planning document only.** No schema changes, no new fetchers, and no admin
> UI changes ship in this document. It records what the *current* data model
> can already do for nine candidate content types, what (if anything) is
> missing, and the safest way to source each — as input to the later phases in
> this expansion (taxonomy, classifier/ranking tuning, admin presets, and the
> dedicated workflow docs for bank/card offers, cashback portals, and dining
> delivery).

## How to read each entry

For every content type:

1. **Existing table** that can already represent it (if any).
2. **New table needed?**
3. **Admin workflow required** to get it live.
4. **Public UI location** it would surface in.
5. **Source monitoring risk level** — how risky it would be to *automate*
   discovery of this content (login walls, anti-bot, ToS).
6. **Safest ingestion method** given that risk.
7. **Manual-only for now?**

All nine inherit the platform-wide invariants already enforced elsewhere in
this repo: staged/admin-reviewed before publication, no auto-publish, no
auto-apply of offer changes, no scraping of HTML/login-gated/Cloudflare-
protected pages, RSS/Atom feed parsing only for any automated discovery, and
no Cashrewards anywhere.

---

## 1. Credit card sign-up bonuses

*e.g. "AmEx Qantas Business: 190,000 bonus Qantas Points, $6,000 spend in 3
months, $450 annual fee".*

| | |
|---|---|
| **Existing table** | None fits cleanly. `points_offers` is shopping-earn-rate shaped (`merchant_id`, per-dollar `earn_multiple`, `mechanism` ∈ `in-store-boost \| card-linked \| shopping-portal \| base-earn`) — a one-off, spend-threshold-gated, card-product-tied bonus has no home there without distorting those numeric fields. |
| **New table needed?** | **Yes** — a dedicated `card_offers` table (bank/provider, card name, bonus type, bonus value, minimum spend, spend window, annual fee, eligibility notes, expiry, source URL, confidence, `is_published`). Fully specified in Phase 6 (`docs/bank-card-offer-workflow.md`). Additive only; not applied without separate review. |
| **Admin workflow** | Manual admin entry through a new CRUD screen (mirrors `cashback`/`gift-cards`/`points` admin pages: `is_published` boolean, `requireAdmin()`, audit log, `revalidatePath`). |
| **Public UI** | New section — candidate: a `/cards` or `/bank-offers` page, or a filter on `/deals`. Planned in Phase 9. |
| **Risk level** | **High** if attempting to auto-fetch card issuer marketing pages (login walls, Cloudflare on most AU bank sites). **Low** for the already-approved OzBargain RSS pipeline, which already carries community posts about these bonuses (e.g. the AmEx Qantas item this session's classifier fix was built around). |
| **Safest ingestion** | Admin reads the bank's own public (non-login-gated) offer page by hand, or cross-references an OzBargain community post already staged in `feed_items`, and manually keys the structured row. **No automated fetch of any bank/issuer site.** |
| **Manual-only for now?** | **Yes.** |

## 2. Bank card cashback/offers (statement credits, Amex Offers, card-linked Apple Pay bonuses)

*e.g. "[Westpac, StG, BoM, BSA] 50% Apple Pay ($10 cap)" — already appears as
raw OzBargain community posts in the current `feed_items` table.*

| | |
|---|---|
| **Existing table** | Conceptually distinct from `cashback_offers` (that table is scoped to the two cashback **portals**, ShopBack/TopCashback, via a DB `CHECK` constraint — loosening it would blur "portal % rate" with "bank statement credit $X", which have different shapes: card-linked, often merchant-specific, usually a flat $ or % capped credit rather than an ongoing rate). |
| **New table needed?** | **Yes** — same `card_offers` table as #1, with `bonus_type = statement_credit \| cashback`. See Phase 6. |
| **Admin workflow** | Manual entry, same pattern as #1. |
| **Public UI** | Same `/cards`-style section as #1 (Phase 9). |
| **Risk level** | **High** for automated discovery — these offers live inside logged-in banking apps/portals (CommBank app, Westpac Rewards, Amex Offers dashboard), which must never be scraped or logged into. **Low** for OzBargain posts *about* these offers, which already flow through the approved feed pipeline. |
| **Safest ingestion** | OzBargain-sourced community posts (existing pipeline) cross-checked by an admin, plus manual entry from banks' own public press/offer pages. Never log into or scrape a bank/card portal. |
| **Manual-only for now?** | **Yes.** |

## 3. Grocery discounts

*Coles/Woolworths-specific deals — already substantially covered.*

| | |
|---|---|
| **Existing table** | Fully covered today: `ozbargain_signals` (one-off grocery deal signals) plus the existing `cashback_offers`/`gift_card_offers`/`points_offers` per-merchant rows for Coles/Woolworths (already tracked stores). |
| **New table needed?** | **No.** |
| **Admin workflow** | Existing signals queue (`/admin/signals/queue`) + existing offer CRUD. |
| **Public UI** | Already live: `/deals`, `/search`, `/stores/coles`, `/stores/woolworths`. |
| **Risk level** | **Low** — already flows through the approved OzBargain RSS feed. |
| **Safest ingestion** | No change needed. Phase 3 (classifier) and Phase 4 (ranking) add grocery-specific keyword signal so relevant items surface/rank better; no new source. |
| **Manual-only for now?** | No — already semi-automated via the existing staged pipeline (admin still reviews every item before it becomes public). |

## 4. Discounted gift cards

| | |
|---|---|
| **Existing table** | `gift_card_offers` — fully supports this today (brand, `discount_percent`, channel, accepted-at merchants, points-on-purchase, cap, dates, usage/stack notes). |
| **New table needed?** | **No.** |
| **Admin workflow** | Existing CRUD (`/admin/gift-cards`). A rate-change **detection** path already exists in schema (`offer_change_candidates` → `gift_card_offers.discount_percent`, wired in `lib/monitor/offerChanges.ts`) but nothing currently populates it — it's schema-only groundwork, not a live detector. |
| **Public UI** | Already live: `/deals` gift-card section, stack calculator, store pages. |
| **Risk level** | **Low** (manual entry, current state). |
| **Safest ingestion** | Manual entry (current state). The dormant `offer_change_candidates` detector, if ever built, must only stage proposed changes for admin **Apply** — never auto-apply. |
| **Manual-only for now?** | **Yes.** |

## 5. Automotive deals

| | |
|---|---|
| **Existing table** | `ozbargain_signals` already models one-off product deals (title/summary/price/promo code/`deal_kind`) — exactly the shape of a typical automotive deal (tyres, motor oil, car accessories). |
| **New table needed?** | **No.** |
| **Admin workflow** | Existing signals queue → admin paraphrase/approve into `ozbargain_signals`. |
| **Public UI** | Already live via `/deals`, `/search`, and matched store pages (e.g. Bunnings, Costco). |
| **Risk level** | **Low** — existing RSS pipeline. |
| **Safest ingestion** | No change needed; Phase 3/4 keyword tuning already prioritises automotive terms (tyres, motor oil, vehicle). |
| **Manual-only for now?** | No — existing staged pipeline. |

## 6. Electronics deals

| | |
|---|---|
| **Existing table** | Same as automotive — `ozbargain_signals` already models this; electronics is already a top-priority category in both the feed classifier and homepage ranking. |
| **New table needed?** | **No.** |
| **Admin workflow** | Existing signals queue. |
| **Public UI** | Already live. |
| **Risk level** | **Low** — existing RSS pipeline. |
| **Safest ingestion** | No change needed. |
| **Manual-only for now?** | No — existing staged pipeline. |

## 7. ShopBack / TopCashback cashback offers

| | |
|---|---|
| **Existing table** | `cashback_offers` — the `provider` column already has a DB `CHECK` constraint limited to exactly `ShopBack` and `TopCashback` (Cashrewards is structurally impossible, matching `CLAUDE.md`). Fully wired end-to-end: admin CRUD → `/deals` → stack calculator → search. |
| **New table needed?** | **No.** |
| **Admin workflow** | Existing CRUD (`/admin/cashback`). Rate-change staging schema exists (`offer_change_candidates` → `cashback_offers.rate_percent`) but has no live detector today. |
| **Public UI** | Already live. |
| **Risk level** | **Low** for admin entry. **Would be high** if anyone tried to scrape ShopBack's or TopCashback's own site for live rates (both are commercial portals, likely rate-limited/anti-bot) — explicitly out of scope. |
| **Safest ingestion** | Manual entry (current state). If rate-change detection is ever built, it should only read OzBargain community posts *about* ShopBack/TopCashback rate boosts (already flows through the approved feed and is already tagged "preferred" by the classifier) and stage a proposed change — never fetch ShopBack/TopCashback directly, never auto-apply. Formalised in Phase 7. |
| **Manual-only for now?** | **Yes**, for both creation and any future rate change. |

## 8. Uber Eats / DoorDash dining offers

| | |
|---|---|
| **Existing table** | `ozbargain_signals` already fits a one-off, publicly-posted promo-code dining deal with zero schema change — e.g. "$10 Ding Dong Deals - Uber Eats" is already present as a raw `feed_items` row today. `weekly_deals` was investigated and set aside for _this_ use case as the wrong shape (a curated weekly-bundle model, not a per-signal one), not because it is inert — as of commit `2835137` its `component_ids` are resolved and rendered as the "This week's picks" section on `/deals` (`lib/offers/weeklyPicks.ts`). |
| **New table needed?** | **Optional, not required for MVP.** A dedicated `dining_delivery_offers` table (platform, discount/code, minimum spend, new-vs-existing-customer flag, expiry) is only justified if structured fields become necessary — proposed as an optional additive migration in Phase 8, deferred until there's real content volume to justify it. |
| **Admin workflow** | Existing signals queue today (zero new work); a dedicated CRUD only if the optional table is built later. |
| **Public UI** | Already live via `/deals`/`/search` signal cards; a dedicated section only if the optional table is built. |
| **Risk level** | **High** for anything requiring the Uber Eats/DoorDash app or an account-linked offers page (login-gated, must never be scraped). **Low** for public, non-personalised promo codes posted to OzBargain (existing approved feed). |
| **Safest ingestion** | Existing OzBargain feed pipeline for public promo-code posts only. Never scrape or log into delivery-platform apps. |
| **Manual-only for now?** | Effectively yes beyond what the existing signal pipeline already surfaces. |

## 9. CBA / NAB / ANZ / Westpac / AmEx offers

*The "bank/provider" instance of #1 and #2 — grouped here because the
ingestion story is identical.*

| | |
|---|---|
| **Existing table** | None dedicated (see #1/#2 rationale). `ozbargain_signals` can already hold these as unstructured one-off signals today — the AmEx Qantas item and Westpac/StG/BoM/BSA Apple Pay item used to motivate this whole expansion are **already sitting in `feed_items`** right now, confirming the pipeline already surfaces this content; the gap is (a) no structured place to *publish* it as a comparable public offer, and (b) the classifier needed tuning to stop treating "Travel Fund"/"dining" wording as disqualifying (fixed this session; extended further in Phase 3). |
| **New table needed?** | Recommended (`card_offers`, same as #1/#2) for structured, comparable fields — but not blocking; the signals pipeline already works today with zero schema change for less-structured cases. |
| **Admin workflow** | Existing signals queue today; a dedicated CRUD once `card_offers` is built. |
| **Public UI** | `/deals` + `/search` today via signal cards; a future `/cards` page once built (Phase 9). |
| **Risk level** | **High** for any direct fetch of card issuer/bank sites (universally login-gated and/or Cloudflare-protected). **Low** for the existing approved OzBargain RSS pipeline. |
| **Safest ingestion** | OzBargain feed (existing, approved) + manual admin entry from banks' own public, non-login-gated marketing/press pages, hand-verified. Never automate a fetch against any bank/issuer property. |
| **Manual-only for now?** | **Yes.** |

---

## Summary table

| Content type | New table? | Manual-only now? | Primary risk if automated |
|---|:---:|:---:|---|
| Credit card sign-up bonuses | Yes (`card_offers`) | Yes | Bank sites: login/Cloudflare |
| Bank card cashback/offers | Yes (`card_offers`) | Yes | Bank apps/portals: login-gated |
| Grocery discounts | No | No (staged pipeline) | — (already low-risk RSS) |
| Discounted gift cards | No | Yes (creation) | — |
| Automotive deals | No | No (staged pipeline) | — (already low-risk RSS) |
| Electronics deals | No | No (staged pipeline) | — (already low-risk RSS) |
| ShopBack/TopCashback cashback | No | Yes | Portal sites: anti-bot/ToS |
| Uber Eats/DoorDash dining | Optional | Effectively yes | Delivery apps: login-gated |
| CBA/NAB/ANZ/Westpac/AmEx offers | Recommended (`card_offers`) | Yes | Bank sites: login/Cloudflare |

**Net new schema surface:** one additive table (`card_offers`), and only if
Phase 6 concludes it's justified — no changes to `layout.tsx`, `globals.css`,
RLS policies, or the cron schedule are implied by any of the above.

## Next steps

- **Phase 2** — a lightweight shared category taxonomy (pure TypeScript) so
  the classifier, ranking, and admin copy for these categories don't drift.
- **Phase 3/4** — extend the feed classifier and homepage ranking to treat
  card-bonus/bank-offer/grocery/ShopBack/TopCashback/dining-delivery wording
  as preferred signals (staging only — no retroactive reclassification, no
  write-mode monitor runs).
- **Phase 6/7/8** — formal workflow docs for the `card_offers` proposal,
  the ShopBack/TopCashback source policy, and the dining-delivery plan.
- **Phase 9** — where all of this actually surfaces in the public UI.
