-- DealStack AU — initial schema (Phase: Supabase + manual admin)
--
-- Mirrors the existing TypeScript types so rows map 1:1 to lib/data.ts and
-- lib/offers/manualOffers.ts. String ids from the static data are kept as text
-- primary keys to preserve cross-references (acceptedAtMerchantIds, componentIds,
-- merchantId). No scraping / agents / external calls are involved anywhere.
--
-- Security model:
--   * RLS enabled on every table, default-deny.
--   * Public (anon + authenticated) may SELECT published/approved rows only.
--   * No public INSERT/UPDATE/DELETE — writes happen via the service role
--     (seed script now; admin-gated server actions later), which bypasses RLS.
--   * admins + audit_log are not publicly readable.

create extension if not exists pgcrypto;

-- ── updated_at trigger helper ────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── stores ───────────────────────────────────────────────────────────────────
create table if not exists stores (
  id                          text primary key,
  name                        text not null,
  category                    text not null,
  logo                        text not null,
  logo_path                   text,
  logo_text                   text,
  logo_subtext                text,
  logo_theme                  jsonb,
  discount_percent            numeric not null default 0,
  discount_code               text not null default '',
  expiry_date                 date,
  cashback_percent            numeric not null default 0,
  -- Cashback provider is intentionally limited. Cashrewards is NOT allowed.
  cashback_provider           text not null default '—'
                                check (cashback_provider in ('ShopBack', 'TopCashback', '—')),
  gift_card_discount_percent  numeric not null default 0,
  gift_card_source            text not null default '',
  points_program              text not null default '—',
  points_rate                 text not null default '',
  aliases                     text[] not null default '{}',
  is_published                boolean not null default true,
  sort_order                  integer not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ── gift_card_offers ─────────────────────────────────────────────────────────
create table if not exists gift_card_offers (
  id                        text primary key,
  brand                     text not null,
  discount_percent          numeric not null default 0,
  channel                   text not null
                              check (channel in ('membership-portal', 'supermarket-promo', 'bank-benefit')),
  source                    text not null,
  accepted_at_merchant_ids  text[] not null default '{}',
  points_on_purchase        jsonb,
  cap_dollars               numeric,
  expiry_date               date,
  start_date                date,
  purchase_location         text,
  purchase_method           text
                              check (purchase_method in ('online', 'in-store', 'online-and-in-store', 'unknown')),
  limit_per_customer        text,
  accepted_at               text[] not null default '{}',
  usage_notes               text[] not null default '{}',
  stack_notes               text[] not null default '{}',
  source_detail_url         text,
  citations                 jsonb not null default '[]',
  confidence                text not null
                              check (confidence in ('confirmed', 'needs-verification', 'expired-unknown')),
  last_checked_at           timestamptz not null default now(),
  is_published              boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ── cashback_offers (ShopBack / TopCashback only — never Cashrewards) ────────
create table if not exists cashback_offers (
  id                          text primary key,
  merchant_id                 text not null references stores (id) on delete cascade,
  provider                    text not null
                                check (provider in ('ShopBack', 'TopCashback')),
  rate_percent                numeric not null default 0,
  flat_amount                 numeric,
  cap_dollars                 numeric,
  is_upsized                  boolean not null default false,
  excludes_gift_card_payment  boolean not null default false,
  terms_summary               text not null default '',
  expiry_date                 date,
  citations                   jsonb not null default '[]',
  confidence                  text not null
                                check (confidence in ('confirmed', 'needs-verification', 'expired-unknown')),
  last_checked_at             timestamptz not null default now(),
  is_published                boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ── points_offers ────────────────────────────────────────────────────────────
create table if not exists points_offers (
  id                 text primary key,
  merchant_id        text references stores (id) on delete cascade,
  program            text not null,
  earn_rate_display  text not null default '',
  earn_multiple      numeric,
  point_value_cents  numeric,
  mechanism          text not null
                       check (mechanism in ('in-store-boost', 'card-linked', 'shopping-portal', 'base-earn')),
  expiry_date        date,
  citations          jsonb not null default '[]',
  confidence         text not null
                       check (confidence in ('confirmed', 'needs-verification', 'expired-unknown')),
  last_checked_at    timestamptz not null default now(),
  is_published       boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── ozbargain_signals (community/corroboration layer; manual only) ───────────
create table if not exists ozbargain_signals (
  id                text primary key,
  source_native_id  text unique,
  merchant_id       text references stores (id) on delete set null,
  title             text not null,
  summary           text not null default '',
  votes_sample      integer,
  comment_count     integer,
  sentiment         text not null
                      check (sentiment in ('hot', 'neutral', 'warning', 'expired')),
  deal_kind         text not null
                      check (deal_kind in ('discount-code', 'cashback', 'gift-card', 'points', 'guide')),
  source_url        text not null,
  merchant_url      text,
  product_url       text,
  posted_at         date,
  expiry_date       date,
  tags              text[] not null default '{}',
  promo_code        text,
  price_text        text,
  signal_score      numeric,
  confidence        text not null
                      check (confidence in ('confirmed', 'needs-verification', 'expired-unknown')),
  last_checked_at   timestamptz not null default now(),
  -- True for static/manual MVP examples (placeholder source URLs). The future
  -- monitoring agent will insert real signals with is_sample = false.
  is_sample         boolean not null default false,
  status            text not null default 'pending'
                      check (status in ('pending', 'approved', 'hidden', 'expired')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── weekly_deals (curated view referencing offer ids) ────────────────────────
create table if not exists weekly_deals (
  id             text primary key,
  week_of        date not null,
  merchant_id    text references stores (id) on delete set null,
  title          text not null,
  summary        text not null default '',
  highlight      text not null
                   check (highlight in ('best-stack', 'gift-card', 'points', 'cashback', 'signal', 'needs-verification')),
  component_ids  text[] not null default '{}',
  citations      jsonb not null default '[]',
  expiry_date    date,
  confidence     text not null
                   check (confidence in ('confirmed', 'needs-verification', 'expired-unknown')),
  is_published   boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── admins (allowlist for Supabase Auth) — not publicly readable ─────────────
create table if not exists admins (
  email       text primary key,
  role        text not null default 'admin',
  created_at  timestamptz not null default now()
);

-- ── audit_log (optional; written by admin actions later) ─────────────────────
create table if not exists audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_email  text,
  action       text not null,
  table_name   text not null,
  row_id       text,
  diff         jsonb,
  created_at   timestamptz not null default now()
);

-- ── helpful indexes ──────────────────────────────────────────────────────────
create index if not exists idx_gift_card_offers_published on gift_card_offers (is_published);
create index if not exists idx_cashback_offers_merchant on cashback_offers (merchant_id);
create index if not exists idx_points_offers_merchant on points_offers (merchant_id);
create index if not exists idx_signals_status_score on ozbargain_signals (status, signal_score desc);
create index if not exists idx_weekly_deals_week on weekly_deals (week_of desc);

-- ── updated_at triggers ──────────────────────────────────────────────────────
create trigger trg_stores_updated_at before update on stores
  for each row execute function set_updated_at();
create trigger trg_gift_card_offers_updated_at before update on gift_card_offers
  for each row execute function set_updated_at();
create trigger trg_cashback_offers_updated_at before update on cashback_offers
  for each row execute function set_updated_at();
create trigger trg_points_offers_updated_at before update on points_offers
  for each row execute function set_updated_at();
create trigger trg_ozbargain_signals_updated_at before update on ozbargain_signals
  for each row execute function set_updated_at();
create trigger trg_weekly_deals_updated_at before update on weekly_deals
  for each row execute function set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Enable RLS everywhere (default-deny). Only the SELECT policies below open
-- anything up, and only for published/approved rows. There are deliberately no
-- INSERT/UPDATE/DELETE policies: all writes go through the service role.
alter table stores            enable row level security;
alter table gift_card_offers  enable row level security;
alter table cashback_offers   enable row level security;
alter table points_offers     enable row level security;
alter table ozbargain_signals enable row level security;
alter table weekly_deals      enable row level security;
alter table admins            enable row level security;
alter table audit_log         enable row level security;

-- Public read policies (anon + authenticated), published/approved only.
create policy "public read published stores"
  on stores for select to anon, authenticated
  using (is_published = true);

create policy "public read published gift_card_offers"
  on gift_card_offers for select to anon, authenticated
  using (is_published = true);

create policy "public read published cashback_offers"
  on cashback_offers for select to anon, authenticated
  using (is_published = true);

create policy "public read published points_offers"
  on points_offers for select to anon, authenticated
  using (is_published = true);

create policy "public read approved ozbargain_signals"
  on ozbargain_signals for select to anon, authenticated
  using (status = 'approved');

create policy "public read published weekly_deals"
  on weekly_deals for select to anon, authenticated
  using (is_published = true);

-- admins and audit_log: no policies → no anon/authenticated access at all.
-- (Service role bypasses RLS for seeding and future admin server actions.)
