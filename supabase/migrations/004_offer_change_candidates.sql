-- DealStack AU — offer change staging (Phase 1: detect, never auto-publish)
--
-- Staging + review workflow for DETECTED changes to cashback rates, gift-card
-- discounts, points offers and promo/discount opportunities. This migration only
-- creates the schema — there is NO fetcher, cron, or agent here, and nothing
-- makes an external request. Detection (when wired) only runs against APPROVED
-- feed/API sources; arbitrary pages, logins and bot-protected sites are never
-- crawled. Cashrewards is never a source.
--
-- Flow: monitor stages rows here (review_state = 'new') → an admin reviews each
-- on /admin/offer-changes and explicitly Applies / Ignores / Marks duplicate.
-- NOTHING is auto-applied and NOTHING is auto-published: a published offer only
-- changes when an admin clicks Apply.
--
-- Security model (same posture as the feed_* staging tables in 002):
--   * RLS enabled, default-deny.
--   * NO anon/authenticated policies — service-role only, for the admin-gated
--     review page. The public site never reads this table.
--
-- Relies on pgcrypto (gen_random_uuid) and set_updated_at(), both from 001.

-- ── Source registry tag on feed_sources ──────────────────────────────────────
-- Classify each registered source. Only verified feed/API types are ever
-- fetched (see APPROVED_FEED_SOURCE_TYPES in lib/monitor/offerChanges.ts);
-- everything else is registry-only. Additive + safe-defaulted so existing rows
-- keep working.
alter table feed_sources
  add column if not exists source_type text not null default 'manual-url'
    check (source_type in (
      'ozbargain', 'pointhacks', 'freepoints', 'gcdb', 'provider-feed', 'manual-url'
    ));

-- ── offer_change_candidates — detected-change staging / review queue ──────────
create table if not exists offer_change_candidates (
  id                         uuid primary key default gen_random_uuid(),
  -- Which kind of offer this change is about.
  source_type                text not null
                               check (source_type in ('cashback', 'gift_card', 'points', 'promo')),
  -- Provider / source name, e.g. 'ShopBack', 'OzBargain'.
  source_name                text not null,
  -- Optional link to a tracked store; cleared if that store is removed.
  merchant_id                text references stores (id) on delete set null,
  -- The specific offer row an Apply would update (cashback/gift_card/points
  -- offer id, or store id for a promo). Null when the monitor could not resolve
  -- it unambiguously — Apply refuses to run without it.
  target_id                  text,
  detected_title             text not null,
  detected_rate_or_discount  text not null default '',
  detected_url               text not null default '',
  -- Snapshot of the current published value at detection time (for the compare).
  previous_value             text,
  proposed_value             text not null default '',
  confidence                 text not null default 'needs-verification'
                               check (confidence in ('confirmed', 'needs-verification', 'expired-unknown')),
  raw_summary                text not null default '',
  -- Dedupe key: same detected change → same hash → idempotent staging.
  content_hash               text not null unique,
  -- Review triage. Only an admin moves a row out of 'new'.
  review_state               text not null default 'new'
                               check (review_state in ('new', 'applied', 'ignored', 'duplicate')),
  -- Who/when reviewed — set by the admin action only.
  reviewed_by                text,
  reviewed_at                timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- ── helpful indexes ──────────────────────────────────────────────────────────
-- The review page lists by triage state (default 'new').
create index if not exists idx_offer_change_candidates_review_state
  on offer_change_candidates (review_state);
-- "What changed for this merchant?"
create index if not exists idx_offer_change_candidates_merchant
  on offer_change_candidates (merchant_id);
-- content_hash already has a UNIQUE index from the column constraint.

-- ── updated_at trigger ───────────────────────────────────────────────────────
create trigger trg_offer_change_candidates_updated_at
  before update on offer_change_candidates
  for each row execute function set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Enable RLS (default-deny) and add NO policies: anon/authenticated get zero
-- access. All reads/writes go through the service role (admin-gated server
-- actions), which bypasses RLS — same posture as admins / audit_log / feed_*.
alter table offer_change_candidates enable row level security;
