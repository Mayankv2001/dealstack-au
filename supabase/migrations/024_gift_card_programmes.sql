-- DealStack AU — ongoing gift-card programme/catalogue rates (additive)
--
-- NOT APPLIED TO PRODUCTION. This model is intentionally separate from
-- short-term gift_card_offers: Macquarie Marketplace, RACV and NRMA expose
-- changing product catalogues, not one broad temporary promotion.

create table if not exists public.gift_card_programmes (
  id                    text primary key,
  provider              text not null,
  name                  text not null,
  programme_kind        text not null default 'membership-catalogue'
                          check (programme_kind in ('bank-account', 'membership-catalogue', 'employee-benefit')),
  membership_required   boolean not null default false,
  account_required      boolean not null default false,
  account_requirement   text,
  payment_requirement   text,
  is_ongoing            boolean not null default true,
  source_url            text not null check (source_url ~ '^https://'),
  terms_url             text check (terms_url is null or terms_url ~ '^https://'),
  confidence            text not null default 'needs-verification'
                          check (confidence in ('confirmed', 'needs-verification')),
  last_checked_at       timestamptz not null,
  review_by_date        date not null,
  is_published          boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (not is_published or (
    confidence = 'confirmed' and is_ongoing and review_by_date >= current_date
  ))
);

create table if not exists public.gift_card_programme_rates (
  id                       uuid primary key default gen_random_uuid(),
  programme_id             text not null references public.gift_card_programmes (id) on delete restrict,
  rate_key                 text not null,
  product_id               text references public.gift_card_products (id) on delete restrict,
  brand_name               text not null,
  promotion_type           text not null default 'discount'
                             check (promotion_type in ('discount', 'fixed-dollar-discount', 'bonus-value', 'fee-waiver')),
  discount_percent         numeric,
  fixed_discount_dollars   numeric,
  bonus_percent            numeric,
  fee_waiver_dollars       numeric,
  threshold_dollars        numeric,
  membership_tier          text,
  payment_requirement      text,
  valid_from               date,
  valid_to                 date,
  is_ongoing               boolean not null default true,
  is_active                boolean not null default true,
  source_url               text not null check (source_url ~ '^https://'),
  confidence               text not null default 'needs-verification'
                             check (confidence in ('confirmed', 'needs-verification')),
  last_checked_at          timestamptz not null,
  review_by_date           date not null,
  is_published             boolean not null default false,
  first_seen_at            timestamptz not null default now(),
  last_seen_at             timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (programme_id, rate_key),
  check (nullif(btrim(rate_key), '') is not null),
  check (nullif(btrim(brand_name), '') is not null),
  check (not (is_ongoing and valid_to is not null)),
  check (not is_published or (
    is_active and confidence = 'confirmed' and review_by_date >= current_date and
    case promotion_type
      when 'discount' then discount_percent > 0 and discount_percent < 100
      when 'fixed-dollar-discount' then fixed_discount_dollars > 0 and threshold_dollars > 0
      when 'bonus-value' then bonus_percent > 0
      when 'fee-waiver' then true
      else false
    end
  ))
);

create table if not exists public.gift_card_programme_rate_history (
  id                 uuid primary key default gen_random_uuid(),
  programme_rate_id  uuid not null references public.gift_card_programme_rates (id) on delete restrict,
  change_kind        text not null
                       check (change_kind in ('product-added', 'product-removed', 'rate-increased', 'rate-decreased', 'terms-changed')),
  changed_fields     text[] not null default '{}',
  old_snapshot       jsonb,
  new_snapshot       jsonb,
  checked_at         timestamptz not null,
  actor_email        text,
  created_at         timestamptz not null default now(),
  unique (programme_rate_id, change_kind, checked_at)
);

create index if not exists idx_gc_programmes_public_review
  on public.gift_card_programmes (is_published, review_by_date);
create index if not exists idx_gc_programme_rates_current
  on public.gift_card_programme_rates (programme_id, is_active, is_published, review_by_date);
create index if not exists idx_gc_programme_rates_product
  on public.gift_card_programme_rates (product_id);
create index if not exists idx_gc_programme_history_rate
  on public.gift_card_programme_rate_history (programme_rate_id, created_at desc);

create trigger trg_gc_programmes_updated_at
  before update on public.gift_card_programmes
  for each row execute function set_updated_at();
create trigger trg_gc_programme_rates_updated_at
  before update on public.gift_card_programme_rates
  for each row execute function set_updated_at();

-- Append-only change trail. Public catalogue rows are mutable reviewed state;
-- every material insert/update is preserved privately as a structured snapshot.
create or replace function public.record_gift_card_programme_rate_history()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_kind text;
  v_changed text[] := '{}';
begin
  if tg_op = 'INSERT' then
    v_kind := 'product-added';
  else
    if old.is_active and not new.is_active then v_kind := 'product-removed'; end if;
    if old.discount_percent is distinct from new.discount_percent then
      v_changed := array_append(v_changed, 'discount_percent');
      if coalesce(new.discount_percent, 0) > coalesce(old.discount_percent, 0) then v_kind := 'rate-increased';
      elsif coalesce(new.discount_percent, 0) < coalesce(old.discount_percent, 0) then v_kind := 'rate-decreased'; end if;
    end if;
    if old.fixed_discount_dollars is distinct from new.fixed_discount_dollars then v_changed := array_append(v_changed, 'fixed_discount_dollars'); end if;
    if old.bonus_percent is distinct from new.bonus_percent then v_changed := array_append(v_changed, 'bonus_percent'); end if;
    if old.fee_waiver_dollars is distinct from new.fee_waiver_dollars then v_changed := array_append(v_changed, 'fee_waiver_dollars'); end if;
    if old.threshold_dollars is distinct from new.threshold_dollars then v_changed := array_append(v_changed, 'threshold_dollars'); end if;
    if old.payment_requirement is distinct from new.payment_requirement then v_changed := array_append(v_changed, 'payment_requirement'); end if;
    if old.membership_tier is distinct from new.membership_tier then v_changed := array_append(v_changed, 'membership_tier'); end if;
    if v_kind is null and cardinality(v_changed) > 0 then v_kind := 'terms-changed'; end if;
  end if;
  if v_kind is not null then
    insert into public.gift_card_programme_rate_history
      (programme_rate_id, change_kind, changed_fields, old_snapshot, new_snapshot, checked_at)
    values
      (new.id, v_kind, v_changed, case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
       to_jsonb(new), new.last_checked_at)
    on conflict (programme_rate_id, change_kind, checked_at) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_gc_programme_rate_history
  after insert or update on public.gift_card_programme_rates
  for each row execute function public.record_gift_card_programme_rate_history();

alter table public.gift_card_programmes enable row level security;
alter table public.gift_card_programme_rates enable row level security;
alter table public.gift_card_programme_rate_history enable row level security;

create policy "public read current gift_card_programmes"
  on public.gift_card_programmes for select to anon, authenticated
  using (
    is_published = true and confidence = 'confirmed' and
    is_ongoing = true and review_by_date >= current_date
  );

create policy "public read current gift_card_programme_rates"
  on public.gift_card_programme_rates for select to anon, authenticated
  using (
    is_published = true and is_active = true and confidence = 'confirmed' and
    review_by_date >= current_date and
    (is_ongoing = true or valid_to >= current_date) and
    exists (
      select 1 from public.gift_card_programmes p
      where p.id = programme_id and p.is_published = true
        and p.confidence = 'confirmed' and p.review_by_date >= current_date
    )
  );

-- History remains private. Public consumers only need the reviewed current
-- catalogue; admins retain the immutable change trail through service role.
