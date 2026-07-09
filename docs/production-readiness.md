# DealStack AU — Production Readiness Checklist

> Step-by-step launch and operations guide. Work through each section in order.
> Check items off as you complete them. Nothing here auto-applies — every step
> requires a deliberate manual action.

---

## 1. Supabase — Apply migrations

Migrations must be applied **in order**. Each one is idempotent (`CREATE TABLE IF NOT EXISTS`), so re-running a completed migration is safe.

```bash
# Option A — Supabase CLI (recommended for local → prod)
supabase db push

# Option B — Supabase Dashboard → SQL editor
# Paste and run each file in sequence:
```

| # | File | What it creates |
|---|---|---|
| 001 | `supabase/migrations/001_initial_schema.sql` | `stores`, `cashback_offers`, `gift_card_offers`, `points_offers`, `ozbargain_signals`, `weekly_deals`, `admins`, `audit_log` |
| 002 | `supabase/migrations/002_feed_import_queue.sql` | `feed_sources`, `feed_items`, `feed_fetch_log` (staging tables, service-role only) |
| 003 | `supabase/migrations/003_compliance_review.sql` | `compliance_reviews` (monitor gate) |
| 004 | `supabase/migrations/004_offer_change_candidates.sql` | `offer_change_candidates` (offer mutation staging) |
| 005 | `supabase/migrations/005_feed_item_homepage_hidden.sql` | `hidden_from_homepage` column on `feed_items` |
| 006 | `supabase/migrations/006_admin_rate_limits.sql` | `admin_rate_limits` (per-admin mutation rate-limit ledger) |
| 007 | `supabase/migrations/007_card_offers.sql` | `card_offers` (bank/credit-card offers shown on `/cards`) |

**Verify:** In the Supabase Dashboard → Table Editor, all tables above should be present with RLS enabled.

---

## 2. Supabase — Admin user setup

### 2a. Create admin user
1. Go to Supabase Dashboard → Authentication → Users
2. Click **Add user** → Enter the admin email and a strong password
3. Confirm the email (or disable email confirmation for the first admin)

### 2b. Add email to the admins allowlist
```sql
-- Run in Supabase Dashboard → SQL editor
INSERT INTO admins (email, role)
VALUES ('you@example.com', 'admin')
ON CONFLICT (email) DO NOTHING;
```

**Why:** `requireAdmin()` does a two-step check — valid session **and** email in the `admins` table. A valid login without an `admins` row still gets a 403.

**Note:** Magic-link sign-in is configured with `shouldCreateUser: false`, so a **new** admin's Supabase Auth user must be created by hand (step 2a, above) *before* their first login attempt — adding the email to the `admins` table alone is not enough; the magic link will silently fail for an email with no pre-existing Auth user.

---

## 3. Vercel — Environment variables

Set these in Vercel Dashboard → Project → Settings → Environment Variables. **Never** commit real values.

### Required (all environments)

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR-ref.supabase.co` | Safe to expose; RLS limits access |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key from Supabase Dashboard | Safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key | **Server-only.** Never prefix with `NEXT_PUBLIC_`. Bypasses RLS. |
| `ADMIN_EMAILS` | `you@example.com` | Comma-separated. Must match the `admins` table rows. |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.vercel.app` | Used for auth redirects |
| `CRON_SECRET` | Long random string (32+ chars) | Authenticates the cron route. Generate: `openssl rand -hex 32` |

### Required to activate feed monitoring (add later)

| Variable | Value | Notes |
|---|---|---|
| `OZB_MONITOR_ENABLED` | `true` | **Only set after compliance approval** (step 5) |
| `OZB_MONITOR_USER_AGENT` | `DealStackAU/1.0 (+https://your-site/about; contact: you@example.com)` | Identifying user-agent — never spoof a browser |

### Optional

| Variable | Default | Notes |
|---|---|---|
| `OZB_MONITOR_MAX_FEEDS_PER_RUN` | `1` | Hard cap per cron run |
| `OZB_MONITOR_MIN_INTERVAL_HOURS` | `12` | Per-feed polling floor |
| `DATA_SOURCE` | `supabase` | Set to `static` to force static fallback data |

---

## 4. Seed base data

After applying migrations and setting env vars:

```bash
# In your local dev environment with .env.local filled in:
npm run seed               # stores, cashback_offers, gift_card_offers, points_offers
npm run seed:feed-items    # sample OzBargain staged feed items (optional)
npm run seed:offer-changes # sample offer change candidates (optional)
```

**Note:** Seed scripts use the service-role key. Run them locally only — never expose service-role in a Vercel function.

---

## 5. Compliance approval (required before enabling monitoring)

The monitor will refuse to run until an approved compliance review exists in the database.

1. Log in to `/admin` with the admin account
2. Navigate to **Compliance** (`/admin/compliance`)
3. Review the compliance checklist in `docs/ozbargain-monitoring.md`
4. Confirm:
   - OzBargain robots.txt has been reviewed for the target feed paths
   - Feed URLs are RSS/Atom — no HTML scraping
   - User-agent string identifies the project with a contact URL
   - Fetch interval is set to 12h+ (daily cron satisfies this automatically)
5. Click **Approve review** in the admin UI

**Only after this step** should you set `OZB_MONITOR_ENABLED=true` in Vercel.

---

## 6. OzBargain feed source setup

1. Navigate to **Feed Sources** (`/admin/signals/sources`)
2. Add the OzBargain feed URL you want to monitor (the allowed OzBargain category/store feed)
3. Toggle the feed **Enabled**
4. Verify the monitor page at `/admin/monitor` shows all checklist items green

---

## 7. Vercel Cron — once daily (built-in)

The cron is already configured in `vercel.json` at `0 2 * * *` (02:00 UTC daily). **Do not change this to sub-daily** — Vercel Hobby plan allows only one cron and it must be at most daily.

The cron calls `GET /api/cron/monitor-feeds` with the `Authorization: Bearer CRON_SECRET` header automatically (Vercel injects it when `CRON_SECRET` is set).

**Verify:** After the first cron run, check `/admin/monitor → Recent fetch runs`.

---

## 8. External scheduler — every 3 hours (optional)

For more frequent feed checks without upgrading Vercel:

1. Sign up at [cron-job.org](https://cron-job.org) (free tier is sufficient)
2. Create a new cron job:
   - **URL:** `https://your-domain.vercel.app/api/cron/monitor-feeds`
   - **Schedule:** every 3 hours (`0 */3 * * *`)
   - **HTTP method:** GET
   - **Header:** `Authorization: Bearer YOUR_CRON_SECRET`
3. The per-feed `OZB_MONITOR_MIN_INTERVAL_HOURS` (default 12h) prevents over-polling — most 3-hour calls find nothing due and return quickly.

**Note:** This page cannot detect whether cron-job.org is set up — only the fetch run history at `/admin/monitor` confirms it is working.

---

## 9. Queue cleanup workflow

After the first successful feed run, staged items appear in `/admin/signals/queue`.

For each staged item:
- **Import as pending signal** — creates a row in `ozbargain_signals` with `status = pending`. Still NOT public.
- **Ignore** — moves item to `review_state = ignored`. Removed from queue view. Nothing published.
- **Mark duplicate** — moves item to `review_state = duplicate`. Nothing published.
- **Hide from Top 5** — sets `hidden_from_homepage = true`. Item stays in the queue and remains importable, but will not appear in the public homepage Top 5 section.

To narrow a long queue before acting, use the keyword **presets** to filter the visible list to specific merchants/deal types. **Ignore visible** then bulk-ignores every item currently matching the filter in one pass (capped per call) — it uses the same per-item `review_state = ignored` write as **Ignore**, so it never imports and never publishes. Import stays one-at-a-time; nothing is ever bulk-imported or auto-published.

To make a pending signal **public**, navigate to **Signals** (`/admin/signals`) and approve it there.

---

## 10. Offer change test workflow

After running the seed script (`npm run seed:offer-changes`), test items appear in `/admin/offer-changes`.

For each candidate:
- Review the **Previous value** vs **Proposed value**
- Check the **Apply hint** (shows exactly which table.column = value will be written)
- **Apply** — updates the live offer in the DB and refreshes public pages. Writes to audit log.
- **Ignore** — stages as ignored. Nothing published. Writes to audit log.
- **Mark duplicate** — stages as duplicate. Nothing published. Writes to audit log.

**Safety check:** Apply requires `review_state = new` and a resolved `target_id`. Already-applied candidates cannot be double-applied.

---

## 11. Emergency disable steps

If you need to stop the monitor immediately:

### Option A — disable via Vercel env (preferred)
1. Vercel Dashboard → Project → Settings → Environment Variables
2. Set `OZB_MONITOR_ENABLED` to `false` (or delete the variable)
3. Redeploy (or wait for next deployment to pick up the change)

### Option B — disable at the DB level (immediate, no redeploy needed)
```sql
-- Disable all feed sources (monitor will skip them even if env var is set)
UPDATE feed_sources SET is_enabled = false;
```

### Option C — disable a specific feed source
1. Navigate to `/admin/signals/sources`
2. Toggle the feed **Disabled**

**Result:** The cron route will run on schedule but find no enabled sources and exit after gate check, logging a blocked run.

---

## 12. Rollback plan

If a bad deploy causes issues:

```bash
# Roll back to the previous deployment in Vercel Dashboard
# → Deployments → click the last known-good deployment → Promote to Production

# Or via CLI:
vercel rollback
```

**DB rollback (offer changes):** There is no automatic undo for applied offer changes. The audit log records every Apply action. To revert a rate change:
1. Find the original value in `/admin/audit`
2. Navigate to the affected offer in the admin (e.g. `/admin/cashback`)
3. Manually edit the rate back to the previous value

**Feed staging tables** (`feed_items`, `offer_change_candidates`) are append-only staging — they never write directly to public offers. A failed cron run or bad staged item cannot break the public site.

---

## 13. Pre-launch verification checklist

- [ ] All 7 migrations applied and verified in Supabase Dashboard
- [ ] Admin user created and email inserted into `admins` table
- [ ] All required Vercel env vars set (no placeholder values)
- [ ] `npm run build` passes locally with production env vars
- [ ] Seed data loaded (`npm run seed`)
- [ ] Public homepage renders at `/`
- [ ] Store pages render at `/stores/[slug]`
- [ ] `/admin` login works with the admin email
- [ ] `/admin/dashboard` shows data quality stats
- [ ] `/admin/monitor` shows checklist items (some may be incomplete — expected pre-monitoring)
- [ ] Compliance review approved at `/admin/compliance` (before enabling monitor)
- [ ] `OZB_MONITOR_ENABLED=true` set only after compliance approval
- [ ] Feed source enabled at `/admin/signals/sources`
- [ ] First cron run verified at `/admin/monitor → Recent fetch runs`
- [ ] Queue items reviewed at `/admin/signals/queue`
- [ ] Card offers verified and published at `/admin/card-offers`
- [ ] `/cards` renders published offers
