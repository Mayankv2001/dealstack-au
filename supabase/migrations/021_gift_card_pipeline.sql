-- DealStack AU — gift-card intelligence pipeline (GCDB-style sources)
--
-- Adds the sourcing/review side of gift-card offers. The APPROVED public
-- surface stays the existing `gift_card_offers` table (RLS: is_published),
-- which the stack engine and public pages already consume — this migration
-- only adds the staging path that feeds it:
--
--   source registry → ingest runs → raw items → offer candidates
--     → (admin review) → gift_card_offers (existing publication gate)
--
-- plus the gift-card instrument model (products / merchant acceptance) and an
-- internal knowledge ledger. Raw source records, candidates, runs and
-- knowledge are SERVICE-ROLE ONLY; nothing here widens public reads except
-- explicitly-published product/acceptance rows. Nothing auto-publishes: the
-- only path to `gift_card_offers` is the reviewed approve RPC below.

-- ── gift_card_sources — allowlisted source registry ──────────────────────────
create table if not exists public.gift_card_sources (
  id                      text primary key,
  name                    text not null,
  base_url                text not null,
  feed_url                text not null,
  source_type             text not null default 'rss'
                            check (source_type in ('rss', 'atom', 'api')),
  -- Both gates default OFF: the env flag (GCDB_INGEST_ENABLED) AND this row
  -- must be enabled before a single outbound request is made.
  enabled                 boolean not null default false,
  automated_fetch_allowed boolean not null default false,
  terms_checked_at        timestamptz,
  robots_checked_at       timestamptz,
  etag                    text,
  last_modified           text,
  last_success_at         timestamptz,
  last_error_at           timestamptz,
  last_error              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ── gift_card_ingest_runs — run ledger + one-running lock + 40h guard ────────
create table if not exists public.gift_card_ingest_runs (
  id              uuid primary key default gen_random_uuid(),
  source_id       text not null references public.gift_card_sources (id) on delete cascade,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  status          text not null default 'running'
                    check (status in ('running', 'ok', 'partial', 'error', 'skipped')),
  fetch_status    text,
  items_seen      integer not null default 0,
  items_new       integer not null default 0,
  items_updated   integer not null default 0,
  items_unchanged integer not null default 0,
  items_rejected  integer not null default 0,
  parser_version  integer not null default 1,
  snapshot_hash   text,
  error_summary   text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_gc_ingest_runs_started
  on public.gift_card_ingest_runs (source_id, started_at desc);
-- Hard DB-level lock: at most one running ingest at a time (mirrors 016/020).
create unique index if not exists idx_gc_ingest_runs_one_running
  on public.gift_card_ingest_runs ((true))
  where status = 'running';

-- ── gift_card_raw_items — idempotent source snapshots ────────────────────────
-- Stores STRUCTURED extracted fields and a bounded factual excerpt only —
-- never full article bodies, images or comments (see docs/gift-card-pipeline.md).
create table if not exists public.gift_card_raw_items (
  id                uuid primary key default gen_random_uuid(),
  source_id         text not null references public.gift_card_sources (id) on delete cascade,
  external_id       text not null,
  canonical_url     text not null,
  title             text not null,
  published_at      timestamptz,
  source_updated_at timestamptz,
  -- Structured payload extracted from the feed (offer_type/store/brands/dates)
  -- plus a <=280-char factual excerpt. NOT the raw article body.
  raw_payload       jsonb not null default '{}'::jsonb,
  content_hash      text not null,
  parser_version    integer not null default 1,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  processing_status text not null default 'new'
                      check (processing_status in ('new', 'parsed', 'rejected', 'superseded')),
  parser_error      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source_id, external_id)
);

create index if not exists idx_gc_raw_items_status
  on public.gift_card_raw_items (processing_status);
create index if not exists idx_gc_raw_items_last_seen
  on public.gift_card_raw_items (last_seen_at desc);

-- ── gift_card_products — the instrument, separate from any promotion ─────────
create table if not exists public.gift_card_products (
  id                  text primary key,
  brand               text not null,
  slug                text not null unique,
  issuer              text,
  card_network        text
                        check (card_network in ('visa', 'mastercard', 'eftpos', 'closed-loop', 'unknown')),
  format              text not null default 'unknown'
                        check (format in ('digital', 'physical', 'digital-and-physical', 'unknown')),
  variable_load       boolean,
  min_denomination    numeric,
  max_denomination    numeric,
  category_restricted boolean not null default false,
  supported_mccs      integer[] not null default '{}',
  mobile_wallet       text not null default 'unknown'
                        check (mobile_wallet in ('supported', 'unsupported', 'partial', 'unknown')),
  redemption_notes    text,
  is_active           boolean not null default false,
  source_evidence     jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── gift_card_merchant_acceptance — where a product can be redeemed ──────────
create table if not exists public.gift_card_merchant_acceptance (
  id             uuid primary key default gen_random_uuid(),
  product_id     text not null references public.gift_card_products (id) on delete cascade,
  store_id       text references public.stores (id) on delete cascade,
  merchant_name  text,
  merchant_category text,
  mcc            integer,
  status         text not null default 'claimed'
                   check (status in ('verified', 'claimed', 'community')),
  outcome        text
                   check (outcome in ('successful', 'unsuccessful', null)),
  is_public      boolean not null default false,
  source_url     text,
  checked_at     timestamptz,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_gc_acceptance_product
  on public.gift_card_merchant_acceptance (product_id);
create index if not exists idx_gc_acceptance_store
  on public.gift_card_merchant_acceptance (store_id);

-- ── gift_card_offer_candidates — the review queue ─────────────────────────────
create table if not exists public.gift_card_offer_candidates (
  id                         uuid primary key default gen_random_uuid(),
  raw_item_id                uuid not null references public.gift_card_raw_items (id) on delete cascade,
  source_id                  text not null references public.gift_card_sources (id) on delete cascade,
  seller_name                text,
  seller_store_id            text references public.stores (id) on delete set null,
  gift_card_brands           text[] not null default '{}',
  gift_card_product_id       text references public.gift_card_products (id) on delete set null,
  promotion_type             text not null default 'unknown'
                               check (promotion_type in
                                 ('discount', 'bonus-value', 'points', 'membership', 'unknown')),
  discount_percent           numeric,
  bonus_percent              numeric,
  points_multiplier          numeric,
  points_program             text,
  effective_discount_percent numeric,
  starts_at                  date,
  expires_at                 date,
  terms_json                 jsonb not null default '{}'::jsonb,
  compatibility_json         jsonb not null default '{}'::jsonb,
  extraction_confidence      numeric not null default 0,
  extraction_warnings        text[] not null default '{}',
  change_kind                text
                               check (change_kind in
                                 ('cosmetic', 'factual-non-material', 'material-offer',
                                  'expiry-extension', 'eligibility', 'stacking-condition',
                                  'source-removed', null)),
  change_diff                jsonb,
  review_status              text not null default 'new'
                               check (review_status in
                                 ('new', 'changed', 'approved', 'rejected', 'archived')),
  reviewer_email             text,
  reviewed_at                timestamptz,
  rejection_reason           text,
  approved_offer_id          text references public.gift_card_offers (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists idx_gc_candidates_review
  on public.gift_card_offer_candidates (review_status, created_at desc);
create index if not exists idx_gc_candidates_raw_item
  on public.gift_card_offer_candidates (raw_item_id);

-- ── gift_card_knowledge — internal reference facts (never public copy) ───────
create table if not exists public.gift_card_knowledge (
  id             uuid primary key default gen_random_uuid(),
  product_id     text references public.gift_card_products (id) on delete cascade,
  topic          text not null
                   check (topic in ('mcc', 'wallet', 'denomination', 'conversion',
                                    'split-payment', 'restriction', 'redemption', 'other')),
  fact           text not null,
  evidence_type  text not null default 'editorial'
                   check (evidence_type in ('official', 'editorial', 'community')),
  confidence     text not null default 'needs-verification'
                   check (confidence in ('confirmed', 'needs-verification')),
  review_status  text not null default 'pending'
                   check (review_status in ('pending', 'approved', 'rejected')),
  source_url     text,
  checked_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── gift_card_offers — additive columns for structured promotion values ──────
alter table public.gift_card_offers
  add column if not exists promotion_type text not null default 'discount'
    check (promotion_type in ('discount', 'bonus-value', 'points', 'membership')),
  add column if not exists bonus_percent numeric,
  add column if not exists points_multiplier numeric,
  add column if not exists points_program text,
  -- Cents per point used for the DISCLOSED valuation (configurable per offer).
  add column if not exists points_value_cents numeric,
  add column if not exists membership_required boolean not null default false,
  add column if not exists activation_required boolean not null default false,
  add column if not exists coupon_required boolean not null default false,
  add column if not exists min_spend numeric,
  add column if not exists denomination_note text,
  add column if not exists format text not null default 'unknown'
    check (format in ('digital', 'physical', 'digital-and-physical', 'unknown')),
  add column if not exists source_name text,
  add column if not exists product_id text references public.gift_card_products (id) on delete set null,
  add column if not exists source_last_seen_at timestamptz;

-- ── updated_at triggers ───────────────────────────────────────────────────────
create trigger trg_gc_sources_updated_at before update on public.gift_card_sources
  for each row execute function set_updated_at();
create trigger trg_gc_raw_items_updated_at before update on public.gift_card_raw_items
  for each row execute function set_updated_at();
create trigger trg_gc_products_updated_at before update on public.gift_card_products
  for each row execute function set_updated_at();
create trigger trg_gc_acceptance_updated_at before update on public.gift_card_merchant_acceptance
  for each row execute function set_updated_at();
create trigger trg_gc_candidates_updated_at before update on public.gift_card_offer_candidates
  for each row execute function set_updated_at();
create trigger trg_gc_knowledge_updated_at before update on public.gift_card_knowledge
  for each row execute function set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Staging/raw/knowledge: default-deny, NO anon/authenticated policies — the
-- service role (admin tooling + cron) is the only reader/writer.
alter table public.gift_card_sources           enable row level security;
alter table public.gift_card_ingest_runs       enable row level security;
alter table public.gift_card_raw_items         enable row level security;
alter table public.gift_card_offer_candidates  enable row level security;
alter table public.gift_card_knowledge         enable row level security;
alter table public.gift_card_products          enable row level security;
alter table public.gift_card_merchant_acceptance enable row level security;

-- Instrument facts an admin explicitly activated/published are public-readable
-- (the detail page needs them); everything else stays private.
create policy "public read active gift_card_products"
  on public.gift_card_products for select to anon, authenticated
  using (is_active = true);
create policy "public read published gift_card_merchant_acceptance"
  on public.gift_card_merchant_acceptance for select to anon, authenticated
  using (is_public = true);

-- ── approve_gift_card_candidate — the ONLY path from candidate to public ─────
-- Transactional: guards the candidate state, upserts the (already-public-gated)
-- gift_card_offers row from ADMIN-REVIEWED values passed in by the action, links
-- the candidate, and writes the audit row — all or nothing. It never reads the
-- raw payload directly: the reviewing admin's edited values are authoritative.
create or replace function public.approve_gift_card_candidate(
  p_candidate_id uuid,
  p_offer_id text,
  p_offer jsonb,
  p_reviewer text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.gift_card_offer_candidates%rowtype;
begin
  select * into candidate
  from public.gift_card_offer_candidates
  where id = p_candidate_id
  for update;

  if not found then raise exception 'Candidate not found.'; end if;
  if candidate.review_status not in ('new', 'changed') then
    raise exception 'Candidate is no longer awaiting review.';
  end if;

  insert into public.gift_card_offers (
    id, brand, discount_percent, channel, source,
    accepted_at_merchant_ids, points_on_purchase, cap_dollars,
    expiry_date, start_date, purchase_location, purchase_method,
    limit_per_customer, accepted_at, usage_notes, stack_notes,
    source_detail_url, citations, confidence, last_checked_at, is_published,
    promotion_type, bonus_percent, points_multiplier, points_program,
    points_value_cents, membership_required, activation_required,
    coupon_required, min_spend, denomination_note, format, source_name,
    product_id, source_last_seen_at
  ) values (
    p_offer_id,
    p_offer->>'brand',
    coalesce((p_offer->>'discount_percent')::numeric, 0),
    coalesce(p_offer->>'channel', 'supermarket-promo'),
    coalesce(p_offer->>'source', 'GCDB'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_offer->'accepted_at_merchant_ids') x), '{}'),
    p_offer->'points_on_purchase',
    (p_offer->>'cap_dollars')::numeric,
    (p_offer->>'expiry_date')::date,
    (p_offer->>'start_date')::date,
    p_offer->>'purchase_location',
    coalesce(p_offer->>'purchase_method', 'unknown'),
    p_offer->>'limit_per_customer',
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_offer->'accepted_at') x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_offer->'usage_notes') x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_offer->'stack_notes') x), '{}'),
    p_offer->>'source_detail_url',
    coalesce(p_offer->'citations', '[]'::jsonb),
    coalesce(p_offer->>'confidence', 'needs-verification'),
    now(),
    true,
    coalesce(p_offer->>'promotion_type', 'discount'),
    (p_offer->>'bonus_percent')::numeric,
    (p_offer->>'points_multiplier')::numeric,
    p_offer->>'points_program',
    (p_offer->>'points_value_cents')::numeric,
    coalesce((p_offer->>'membership_required')::boolean, false),
    coalesce((p_offer->>'activation_required')::boolean, false),
    coalesce((p_offer->>'coupon_required')::boolean, false),
    (p_offer->>'min_spend')::numeric,
    p_offer->>'denomination_note',
    coalesce(p_offer->>'format', 'unknown'),
    p_offer->>'source_name',
    nullif(p_offer->>'product_id', ''),
    now()
  )
  on conflict (id) do update set
    brand = excluded.brand,
    discount_percent = excluded.discount_percent,
    channel = excluded.channel,
    source = excluded.source,
    accepted_at_merchant_ids = excluded.accepted_at_merchant_ids,
    points_on_purchase = excluded.points_on_purchase,
    cap_dollars = excluded.cap_dollars,
    expiry_date = excluded.expiry_date,
    start_date = excluded.start_date,
    purchase_location = excluded.purchase_location,
    purchase_method = excluded.purchase_method,
    limit_per_customer = excluded.limit_per_customer,
    accepted_at = excluded.accepted_at,
    usage_notes = excluded.usage_notes,
    stack_notes = excluded.stack_notes,
    source_detail_url = excluded.source_detail_url,
    citations = excluded.citations,
    confidence = excluded.confidence,
    last_checked_at = excluded.last_checked_at,
    is_published = true,
    promotion_type = excluded.promotion_type,
    bonus_percent = excluded.bonus_percent,
    points_multiplier = excluded.points_multiplier,
    points_program = excluded.points_program,
    points_value_cents = excluded.points_value_cents,
    membership_required = excluded.membership_required,
    activation_required = excluded.activation_required,
    coupon_required = excluded.coupon_required,
    min_spend = excluded.min_spend,
    denomination_note = excluded.denomination_note,
    format = excluded.format,
    source_name = excluded.source_name,
    product_id = excluded.product_id,
    source_last_seen_at = excluded.source_last_seen_at;

  update public.gift_card_offer_candidates
  set review_status = 'approved',
      reviewer_email = p_reviewer,
      reviewed_at = now(),
      approved_offer_id = p_offer_id
  where id = p_candidate_id;

  insert into public.audit_log(actor_email, action, table_name, row_id, diff)
  values (
    p_reviewer, 'approve-gift-card-candidate', 'gift_card_offer_candidates',
    p_candidate_id,
    jsonb_build_object('offerId', p_offer_id, 'promotionType', p_offer->>'promotion_type')
  );

  return p_offer_id;
end;
$$;

revoke all on function
  public.approve_gift_card_candidate(uuid, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function
  public.approve_gift_card_candidate(uuid, text, jsonb, text)
  to service_role;

-- ── Seed: the GCDB source registry row — DISABLED by default ─────────────────
-- Preflight recorded 2026-07-12: robots.txt permits everything except
-- /wp-admin/; https://gcdb.com.au/feed/ is an official RSS 2.0 syndication
-- feed carrying structured offer metadata (offer_type / offer_store /
-- offer_gc). Enabling requires BOTH this row and GCDB_INGEST_ENABLED=true.
insert into public.gift_card_sources
  (id, name, base_url, feed_url, source_type, enabled, automated_fetch_allowed,
   robots_checked_at, terms_checked_at)
values
  ('gcdb', 'Gift Card Database', 'https://gcdb.com.au',
   'https://gcdb.com.au/feed/', 'rss', false, false,
   '2026-07-12T00:00:00Z', '2026-07-12T00:00:00Z')
on conflict (id) do nothing;
