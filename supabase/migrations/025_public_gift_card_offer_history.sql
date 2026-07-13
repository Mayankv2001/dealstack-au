-- DealStack AU — public-safe immutable gift-card offer occurrences
--
-- NOT APPLIED TO PRODUCTION. Requires explicit schema and data approval.
-- This projection stores structured reviewed facts only. It deliberately has
-- no raw payload, article body, comments, review-candidate or audit columns.

create table if not exists public.gift_card_offer_occurrences (
  id                  uuid primary key default gen_random_uuid(),
  source_offer_id     text,
  seller_key          text not null,
  seller_name         text not null,
  product_key         text not null,
  product_name        text not null,
  promotion_type      text not null
                        check (promotion_type in ('discount', 'fixed-dollar-discount', 'bonus-value', 'points', 'promo-credit', 'fee-waiver', 'membership')),
  discount_percent    numeric,
  fixed_dollars       numeric,
  bonus_percent       numeric,
  points_multiplier   numeric,
  points_programme    text,
  threshold_dollars   numeric,
  start_date          date,
  end_date            date not null,
  source_url          text not null check (source_url ~ '^https://'),
  verified_at         timestamptz not null,
  sealed_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  unique (seller_key, product_key, promotion_type, start_date, end_date, source_url),
  check (end_date < current_date),
  check (
    case promotion_type
      when 'discount' then discount_percent > 0
      when 'fixed-dollar-discount' then fixed_dollars > 0 and threshold_dollars > 0
      when 'bonus-value' then bonus_percent > 0
      when 'points' then points_multiplier > 0 and nullif(btrim(points_programme), '') is not null
      when 'promo-credit' then fixed_dollars > 0 and threshold_dollars > 0
      when 'fee-waiver' then fixed_dollars is null or fixed_dollars >= 0
      when 'membership' then discount_percent > 0
      else false
    end
  )
);

create index if not exists idx_gc_occurrence_comparison
  on public.gift_card_offer_occurrences (seller_key, product_key, promotion_type, end_date desc);

alter table public.gift_card_offer_occurrences enable row level security;

create policy "public read sealed gift card occurrences"
  on public.gift_card_offer_occurrences for select to anon, authenticated
  using (sealed_at is not null and end_date < current_date);

create or replace function public.reject_gift_card_occurrence_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Gift-card offer occurrences are immutable; append a corrected occurrence.';
end;
$$;

create trigger trg_gc_occurrence_immutable
  before update or delete on public.gift_card_offer_occurrences
  for each row execute function public.reject_gift_card_occurrence_mutation();
