# DealStack AU — Architecture Review

> Senior-review pass conducted on 2026-06-25.
> Covers safety boundaries, data flow, known risks, and recommended improvements.
> No production code was changed as part of this review.

---

## Current Architecture

### Runtime boundary map

```
Browser
  └── Next.js client components (HomeClient, QueueClient, OfferChangesClient)
        • No Supabase calls
        • No service-role key access
        • Data flows in as props from server components only

Server (Vercel Edge / Node, render time)
  └── Next.js server components & server actions
        Public pages  → lib/repos/* → Supabase (anon key, RLS enforced)
        Admin pages   → lib/admin/repos/* → Supabase (service-role, bypasses RLS)
        Cron route    → lib/monitor/* → Supabase (service-role, admin gate)

Cron scheduler
  └── Vercel Cron (once daily, 02:00 UTC)      → GET /api/cron/monitor-feeds
  └── External scheduler (cron-job.org, opt-in) → GET /api/cron/monitor-feeds
        Both: Bearer CRON_SECRET, same gates, same staging-only writes
```

### Key tables

| Table | Access | Notes |
|---|---|---|
| `stores`, `cashback_offers`, `gift_card_offers`, `points_offers` | anon + service-role | Public offers, RLS published-only |
| `ozbargain_signals` | anon + service-role | Published community signals |
| `feed_items`, `feed_sources` | service-role only | Staging tables, no public RLS policy |
| `offer_change_candidates` | service-role only | Staged offer mutations, review-gated |
| `audit_log` | service-role only | Append-only admin action log |
| `compliance_reviews` | service-role only | Monitor gate; must have an approved row |
| `admins` | service-role only | Email allowlist, no public read policy |

### Data flow for OzBargain signals

```
External feed (RSS only)
  ↓  [cron route / monitor:feeds script]
feed_items (staging, service-role write)
  ↓  [admin reviews in /admin/signals/queue]
ozbargain_signals (published, service-role write on Import)
  ↓  [public homepage server component]
TopDealsSection (rendered server-side, DTO only)
```

No step in this chain is automatic. An admin must click "Import" for a staged item to reach the public table.

---

## Safety Boundaries

### Authentication

- `requireAdmin()` is called at the top of every admin page, server action, and the cron route. The middleware proxy (`proxy.ts`) is explicitly documented as an optimistic check only, never the sole gate.
- Admin session = valid Supabase Auth session **and** email present in the `admins` allowlist table. The allowlist is unreadable via the anon key (no public RLS policy).

### Service-role isolation

- `lib/supabase/admin.ts` throws at module evaluation if called in a browser context (runtime guard via `typeof window`).
- Service-role is only imported in: `lib/admin/repos/*`, the cron API route, and seed scripts. Never in `lib/repos/*` (public reads) or any client component.

### Feed monitor gates

The cron route (`/api/cron/monitor-feeds`) checks all of these before fetching:
1. `CRON_SECRET` Bearer token present
2. `OZB_MONITOR_ENABLED === "true"`
3. At least one approved compliance review in `compliance_reviews`
4. Per-feed polling interval (default 12h) not yet elapsed

If any gate fails, no outbound request is made and the run is logged as blocked.

### Staging invariants

- The monitor writes only to `feed_items` and `fetch_log` — never to `ozbargain_signals` or any offer table.
- `offer_change_candidates` are staged mutations; only `applyOfferChange()` (behind `requireAdmin()` + confirm) updates the live offer table.
- `hidden_from_homepage` on `feed_items` is independent of `review_state` — hiding a signal from the homepage does not change its import eligibility.

### Audit logging

- Every admin mutation (import, ignore, duplicate, apply, hide/show) calls `logAudit()`.
- `logAudit()` is best-effort (never throws) so a failed audit write cannot block the primary action — but this means audit gaps are possible on transient DB errors.

---

## Known Risks

### 1. Audit log is best-effort
**Risk (Low):** A DB timeout on the audit write will silently skip the log entry. The primary action still succeeds.
**Mitigation:** Supabase typically has sub-10ms write latency; this is unlikely in practice.
**Recommendation:** Consider wrapping the primary action and audit log in a single DB transaction (Supabase RPC) for a future improvement.

### 2. Static fallback data is illustrative only
**Risk (Low):** If `DATA_SOURCE=static` or Supabase is unavailable, `lib/data.ts` hardcoded stores serve. These are explicitly labelled as sample data.
**Mitigation:** The disclaimer in the footer covers this. The fallback is intentional, not a data leak.

### 3. No rate-limit on admin actions
**Risk (Low):** Server actions are not rate-limited per admin session.
**Mitigation:** The `admins` allowlist is small. A compromised admin session is a separate concern covered by Supabase Auth.

### 4. `formatExpiry` in `lib/data.ts` assumes `YYYY-MM-DD` without validation
**Risk (Very Low):** If a non-`YYYY-MM-DD` string reaches `formatExpiry`, it will render garbled output rather than throwing.
**Mitigation:** These values only come from the static hardcoded data — not user input. Low practical risk.

### 5. `getTopDeals` uses `CANDIDATE_LIMIT = 50` items for ranking
**Risk (Very Low):** If the staging table grows very large, the 50-item candidate window might miss some high-relevance items posted earlier.
**Mitigation:** Ranking is by `fetched_at DESC`, and the homepage Top 5 is a display convenience, not a critical feature. Acceptable as-is.

---

## Recommended Future Improvements

### Priority: Medium

1. **Wrap audit log in a DB transaction** — use a Supabase RPC that atomically applies the primary change and writes the audit row, eliminating best-effort audit gaps.

2. **Generated TypeScript types from Supabase** — run `supabase gen types typescript` and replace `LooseDB` with the generated schema for compile-time table/column safety.

3. **Admin action rate limiting** — add a simple per-email rate limit (e.g. 100 mutations/hour) to the server actions layer to reduce blast radius of a compromised session.

### Priority: Low

4. **`formatExpiry` input validation** — add a guard in `formatExpiry` (and `formatDateAU`) to return a safe fallback on unexpected input shapes.

5. **Incremental Static Regeneration for public pages** — add `revalidate` intervals to the homepage and store pages so Vercel serves cached HTML between revalidations, reducing Supabase reads under traffic spikes.

6. **Graceful degradation banner** — when `getTopDeals()` returns `[]` due to an error (not just empty staging), surface a subtle "signals unavailable" note rather than silently hiding the section.

---

## Manual Operations Checklist

Before going live / after each deployment:

### Database
- [ ] All migrations applied in order (`001` → `005`): `supabase db push` or via Supabase Dashboard
- [ ] Verify RLS is active on all public-facing tables (`stores`, `cashback_offers`, etc.)
- [ ] At least one row in `admins` table for the admin email

### Vercel Environment
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set (server-only, no `NEXT_PUBLIC_` prefix)
- [ ] `CRON_SECRET` set to a long random string
- [ ] `ADMIN_EMAILS` set (comma-separated allowlist)
- [ ] `NEXT_PUBLIC_SITE_URL` set to the production domain

### OzBargain monitor (if activating)
- [ ] Record and approve a compliance review via `/admin/compliance`
- [ ] Enable at least one feed source via `/admin/signals/sources`
- [ ] Set `OZB_MONITOR_ENABLED=true` in Vercel env
- [ ] Set `OZB_MONITOR_USER_AGENT` with contact URL
- [ ] Optionally configure cron-job.org to call `/api/cron/monitor-feeds` every 3h with Bearer token
- [ ] Verify the monitor page at `/admin/monitor` shows all checklist items green

### Queue hygiene
- [ ] Review and process any staged items in `/admin/signals/queue` before announcing the site
- [ ] Review any staged offer changes in `/admin/offer-changes`
