# Gift-card automation — source policy and adapter permission states

> TASK-01 (Wave 0). **No source is enabled by this document.** Every adapter
> ships disabled with both DB gates (`enabled`, `automated_fetch_allowed`)
> closed and its env flag off. This record fixes each source's permission
> state, retrieval mode, and evidence tier so a future operator can make an
> informed, recorded enablement decision — it does not make one.
>
> **Checked on:** 2026-07-15.
> **Evidence provenance note (important):** the robots.txt findings below were
> retrieved with the repository's `WebFetch` tool, which converts the page to
> markdown and summarises it with a small model — it is **not a guaranteed
> verbatim byte copy**. Treat every robots finding as *directional evidence
> requiring a human verbatim re-check* before any enablement. Nothing here is
> invented; where a source was not fetched this session it is marked
> **not verified**, not guessed. robots-permission is **necessary but not
> sufficient** — automated fetching also requires a recorded terms/copyright
> review, an identifying User-Agent, and admin sign-off.

## Retrieval preference order (per source)

`API → RSS/Atom feed → JSON-LD/structured data → permitted HTML parsing →
admin-assisted manual capture`. Where automated fetching is not *explicitly
permitted after a recorded robots **and** terms review*, the operating mode is
**admin-assisted capture** (an admin pastes/uploads a snapshot into the
existing raw-item → candidate → review path) and the adapter stays disabled.
`lib/security/urlPolicy.ts` host-allowlisting and `fetchEditorialPage.ts`'s
refusal of challenge/login pages apply at every layer; no anti-bot bypass ever.

## Evidence hierarchy (plan §3)

1. Gift-card issuer / official gift-card site · 2. Retailer catalogue/promotion
page · 3. Specialist source (GCDB, Point Hacks) · 4. Additional approved
corroborating source · 5. DealStack review/verification result. A discovery
source (GCDB / Point Hacks) is **never** recorded as primary retailer evidence.

---

## Source records

### 1. GCDB offers RSS — `gcdb` (migration 021)
- **URL:** `https://gcdb.com.au/offers/` (RSS feed already registered).
- **robots.txt (WebFetch, 2026-07-15, model-summarised — verify verbatim):**
  `User-agent: *` → `Disallow: /wp-admin/`, `Allow: /wp-admin/admin-ajax.php`,
  `Sitemap: https://gcdb.com.au/sitemap_index.xml`. **No global `Disallow: /`**;
  `/offers/` not disallowed.
- **Terms/policy:** **not verified this session.** No recorded terms review on
  file for automated reuse of offer content.
- **Feed/API:** RSS exists (the registered feed). Preference tier: **RSS**.
- **Evidence tier:** 3 (specialist / discovery).
- **Adapter state:** **DISABLED** — `enabled=false`, `automated_fetch_allowed=false`,
  env flag off. Robots is permissive, but the terms review and admin sign-off
  are outstanding, so the operating mode remains admin-assisted until recorded.

### 2. Point Hacks weekly gift-card offers — `pointhacks_weekly_gift_cards` (027, unapplied)
- **URL:** `https://www.pointhacks.com.au/weekly-gift-card-offers/`.
- **robots.txt (WebFetch, 2026-07-15, model-summarised — verify verbatim):**
  `User-agent: *` disallows `/wp/wp-admin/`, `/wp/wp-includes/*.php`,
  `/wp-login.php`, `/callback-cross-auth.html`, `/search/`, `/*/feed/`;
  `Allow: /wp/wp-admin/admin-ajax.php`; `Content-Signal: ai-train=yes,
  search=yes, ai-input=yes`. Explicit per-agent `Allow: /` for `GPTBot`,
  **`ClaudeBot`**, **`anthropic-ai`**, `PerplexityBot`, `GoogleOther`.
  **No global `Disallow: /`**; `/weekly-gift-card-offers/` not disallowed.
- **Terms/policy:** **not verified this session.** robots explicitly welcomes
  AI crawlers, but the site's terms of use / copyright for *republishing*
  structured offer data are a separate question and are not yet reviewed.
- **Feed/API:** HTML editorial page (no offer API/feed found). Preference tier:
  **permitted HTML parsing** — *conditional on the terms review*.
- **Evidence tier:** 3 (specialist / discovery).
- **Adapter state:** **DISABLED** — migration 027 registers the row with both
  gates false and null stamps. Even with permissive robots, the terms review is
  outstanding → operating mode **admin-assisted capture** until recorded.

### 3. GCDB gift-card offer predictions page
- **URL:** `https://gcdb.com.au/predictions/`
  (registered as `gcdb_predictions` by migration 029, unapplied).
- **robots.txt:** same host as source 1; `/predictions/` not disallowed per the
  2026-07-15 WebFetch finding (verify verbatim).
- **Terms/policy:** not verified this session.
- **Feed/API:** HTML editorial page. Preference tier: **permitted HTML parsing**
  — conditional on terms review.
- **Evidence tier:** 3 — **and predictions are a strictly isolated, never-public
  record type** (029: RLS default-deny, never inserted into `gift_card_offers`).
- **Adapter state:** **DISABLED / admin-assisted.** Registered disabled. The
  admin path accepts a pasted/uploaded capture only and performs no fetch.

### 4. GCDB merchant database (acceptance lists)
- **URL:** GCDB merchant/store pages under `gcdb.com.au`.
- **robots.txt:** same host as source 1; merchant pages not disallowed per the
  2026-07-15 WebFetch finding (verify verbatim). **No registry row exists.**
- **Terms/policy:** not verified this session.
- **Feed/API:** none found (HTML). Preference tier: **permitted HTML parsing** —
  conditional on terms review.
- **Evidence tier:** 3 for acceptance evidence (`evidence_source_type='gcdb'`);
  **never** recorded as issuer/merchant-official.
- **Adapter state:** **DISABLED / admin-assisted.** *Registry gap:* no source
  row yet — a future migration/admin action must register a disabled
  `gcdb_merchant_db` source before any capture; until then, acceptance evidence
  from GCDB enters only via admin-assisted capture into
  `gift_card_acceptance_candidates` (028) for review.

### 5. Retailer catalogue promotion pages (Coles / Woolworths / Big W)
- **URLs:** the retailers' own catalogue/promotion pages (linked retailer
  evidence, tier 2).
- **robots.txt:** **not fetched this session → permission UNKNOWN.** Each host
  needs its own recorded robots + terms review.
- **Terms/policy:** not verified.
- **Feed/API:** not assessed this session.
- **Evidence tier:** 2 (retailer catalogue) — higher than GCDB/Point Hacks; used
  to corroborate, never replaced by a discovery source.
- **Adapter state:** **DISABLED / admin-assisted.** No registry rows; no
  automated fetch is contemplated without a per-host recorded review.

---

## Adapter state table

| Source | Registry row | `source_type` | robots (2026-07-15) | Terms reviewed | Retrieval mode | Gates | State |
|---|---|---|---|---|---|---|---|
| GCDB offers RSS | `gcdb` (021) | rss | permissive (verify) | **no** | RSS | closed | **disabled** |
| Point Hacks weekly | `pointhacks_weekly_gift_cards` (027) | html | permissive, AI-allowed (verify) | **no** | HTML* | closed | **disabled** |
| GCDB predictions | `gcdb_predictions` (029) | html | permissive (verify) | **no** | HTML* | closed | **disabled** (isolated) |
| GCDB merchant DB | **none (gap)** | — | permissive (verify) | **no** | HTML* | n/a | **admin-assisted only** |
| Retailer catalogues | none | — | **unknown (not fetched)** | **no** | admin-assisted | n/a | **admin-assisted only** |

\* HTML parsing is *conditional* on a recorded terms review; until then the mode
is admin-assisted capture.

## Admin-assisted-only sources (must stay disabled) and reasons

- **All five**, currently — because **no source has a recorded terms/copyright
  review**, which the policy requires *in addition to* permissive robots before
  any automated fetch. Specific reasons: GCDB offers/predictions/merchant-DB and
  Point Hacks are tier-3 discovery sources whose offer/acceptance content reuse
  needs a terms review; the GCDB merchant DB additionally **lacks a registry
  row**; retailer catalogues had **no robots fetched this session** and need a
  per-host review.

## Registry gaps addressed

- **Point Hacks predictions page** → the *predictions* page is `gcdb.com.au`
  (source 3), registered disabled by 029. (The Point Hacks *weekly offers* page
  is source 2, registered by 027.) Both disabled.
- **GCDB merchant data** → **no registry row yet (documented gap)**. Until a
  disabled `gcdb_merchant_db` source is registered, GCDB acceptance evidence is
  admin-assisted-only into `gift_card_acceptance_candidates` (028).

## Operator SQL to stamp a completed review (DOCUMENT ONLY — do not run)

After a human completes and records a verbatim robots + terms review for a
source, an operator stamps the timestamps (still leaving both gates closed;
enablement is a separate, later, explicitly-approved step):

```sql
-- Example: record that GCDB's robots + terms were reviewed. Gates stay closed.
update public.gift_card_sources
set robots_checked_at = now(),
    terms_checked_at  = now()
where id = 'gcdb';
-- Enabling fetch is a SEPARATE, later action requiring explicit approval:
--   update public.gift_card_sources
--   set enabled = true, automated_fetch_allowed = true where id = '...';
-- plus the env flag (e.g. GCDB_INGEST_ENABLED=true) and an identifying UA.
```

Nothing in this task runs the above; the stamps remain null until a real review.
