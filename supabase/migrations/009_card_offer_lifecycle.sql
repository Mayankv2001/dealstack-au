-- DealStack AU — card-offer lifecycle, review deadlines and public history
--
-- expiry_date is the issuer's real end date. review_by_date is DealStack's
-- mandatory freshness deadline. Ongoing offers therefore keep expiry_date NULL
-- but still fail closed when they have not been re-checked on time.

alter table public.card_offers
  add column if not exists review_by_date date,
  add column if not exists bonus_stages jsonb not null default '[]'::jsonb,
  add column if not exists point_value_cents numeric,
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz;

update public.card_offers
set review_by_date = coalesce(
  expiry_date,
  (last_checked_at at time zone 'Australia/Melbourne')::date + 30
)
where review_by_date is null;

alter table public.card_offers
  alter column review_by_date set not null,
  add constraint card_offers_bonus_stages_array
    check (jsonb_typeof(bonus_stages) = 'array'),
  add constraint card_offers_point_value_nonnegative
    check (point_value_cents is null or point_value_cents >= 0),
  add constraint card_offers_archive_state
    check (
      (is_archived = false and archived_at is null)
      or (is_archived = true and archived_at is not null and is_published = false)
    );

-- Preserve the issuer-specific staged structures verified on 2026-07-10.
update public.card_offers
set bonus_stages = jsonb_build_array(
  jsonb_build_object(
    'points', 50000,
    'requirement', 'Spend $5,000 in the first 3 months',
    'timing', 'After the qualifying spend',
    'withinFirstYear', true
  )
), point_value_cents = 1.0
where id = 'card-amex-qantas-bonus';

update public.card_offers
set bonus_stages = jsonb_build_array(
  jsonb_build_object(
    'points', 80000,
    'requirement', 'Spend $5,000 in the first 90 days',
    'timing', 'Initial bonus',
    'withinFirstYear', true
  ),
  jsonb_build_object(
    'points', 30000,
    'requirement', 'Keep the card open for more than 12 months',
    'timing', 'Anniversary bonus',
    'withinFirstYear', false
  )
), point_value_cents = 0.5
where id = 'card-nab-rewards-bonus';

update public.card_offers
set bonus_stages = jsonb_build_array(
  jsonb_build_object(
    'points', 75000,
    'requirement', 'Spend $3,000 in the first 90 days',
    'timing', 'Initial bonus',
    'withinFirstYear', true
  ),
  jsonb_build_object(
    'points', 25000,
    'requirement', 'Make an eligible purchase in the second year',
    'timing', 'Year-two bonus',
    'withinFirstYear', false
  )
), point_value_cents = 0.4
where id = 'card-westpac-altitude-bonus';

update public.card_offers
set bonus_stages = jsonb_build_array(
  jsonb_build_object(
    'points', 130000,
    'requirement', 'Spend $5,000 in the first 3 months',
    'timing', 'Initial bonus',
    'withinFirstYear', true
  ),
  jsonb_build_object(
    'points', 50000,
    'requirement', 'Keep the card open for more than 15 months',
    'timing', 'Retention bonus',
    'withinFirstYear', false
  )
), point_value_cents = 0.5
where id = 'card-anz-rewards-bonus';

-- The old CommBank promotion was already deliberately unpublished. Archive it
-- now so it leaves the active admin list while retaining its row and audit log.
update public.card_offers
set is_archived = true, archived_at = now()
where id = 'card-cba-statement-credit'
  and is_published = false
  and confidence = 'expired-unknown';

create index if not exists idx_card_offers_public_fresh
  on public.card_offers (is_published, is_archived, review_by_date);

drop policy if exists "public read published card_offers" on public.card_offers;
create policy "public read current published card_offers"
  on public.card_offers for select to anon, authenticated
  using (
    is_published = true
    and is_archived = false
    and confidence = 'confirmed'
    and review_by_date >= (now() at time zone 'Australia/Melbourne')::date
    and (
      expiry_date is null
      or expiry_date >= (now() at time zone 'Australia/Melbourne')::date
    )
  );

create table if not exists public.card_offer_history (
  id uuid primary key default gen_random_uuid(),
  card_offer_id text not null references public.card_offers(id) on delete cascade,
  change_summary text not null,
  changed_fields text[] not null default '{}',
  checked_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_card_offer_history_offer_created
  on public.card_offer_history (card_offer_id, created_at desc);

alter table public.card_offer_history enable row level security;
create policy "public read history for published card offers"
  on public.card_offer_history for select to anon, authenticated
  using (
    exists (
      select 1
      from public.card_offers offer
      where offer.id = card_offer_history.card_offer_id
        and offer.is_published = true
        and offer.is_archived = false
        and offer.confidence = 'confirmed'
        and offer.review_by_date >= (now() at time zone 'Australia/Melbourne')::date
        and (
          offer.expiry_date is null
          or offer.expiry_date >= (now() at time zone 'Australia/Melbourne')::date
        )
    )
  );

insert into public.card_offer_history (
  card_offer_id, change_summary, changed_fields, checked_at
)
select
  id,
  'Issuer terms verified and freshness deadline recorded',
  array['source_url', 'review_by_date'],
  last_checked_at
from public.card_offers
where is_archived = false
  and not exists (
    select 1 from public.card_offer_history history
    where history.card_offer_id = card_offers.id
  );

create or replace function public.record_card_offer_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[] := '{}';
  labels text[] := '{}';
begin
  if old.provider is distinct from new.provider then changed := array_append(changed, 'provider'); labels := array_append(labels, 'provider'); end if;
  if old.card_name is distinct from new.card_name then changed := array_append(changed, 'card_name'); labels := array_append(labels, 'card name'); end if;
  if old.offer_type is distinct from new.offer_type then changed := array_append(changed, 'offer_type'); labels := array_append(labels, 'offer type'); end if;
  if old.bonus_points is distinct from new.bonus_points then changed := array_append(changed, 'bonus_points'); labels := array_append(labels, 'bonus points'); end if;
  if old.bonus_stages is distinct from new.bonus_stages then changed := array_append(changed, 'bonus_stages'); labels := array_append(labels, 'bonus stages'); end if;
  if old.cashback_amount is distinct from new.cashback_amount then changed := array_append(changed, 'cashback_amount'); labels := array_append(labels, 'cashback'); end if;
  if old.statement_credit_amount is distinct from new.statement_credit_amount then changed := array_append(changed, 'statement_credit_amount'); labels := array_append(labels, 'statement credit'); end if;
  if old.minimum_spend is distinct from new.minimum_spend or old.minimum_spend_period is distinct from new.minimum_spend_period then changed := array_append(changed, 'minimum_spend'); labels := array_append(labels, 'qualifying spend'); end if;
  if old.annual_fee is distinct from new.annual_fee then changed := array_append(changed, 'annual_fee'); labels := array_append(labels, 'annual fee'); end if;
  if old.eligibility_notes is distinct from new.eligibility_notes then changed := array_append(changed, 'eligibility_notes'); labels := array_append(labels, 'eligibility'); end if;
  if old.offer_summary is distinct from new.offer_summary then changed := array_append(changed, 'offer_summary'); labels := array_append(labels, 'offer summary'); end if;
  if old.source_url is distinct from new.source_url then changed := array_append(changed, 'source_url'); labels := array_append(labels, 'issuer source'); end if;
  if old.expiry_date is distinct from new.expiry_date then changed := array_append(changed, 'expiry_date'); labels := array_append(labels, 'expiry'); end if;
  if old.review_by_date is distinct from new.review_by_date then changed := array_append(changed, 'review_by_date'); labels := array_append(labels, 'review deadline'); end if;
  if old.is_published is distinct from new.is_published then changed := array_append(changed, 'is_published'); labels := array_append(labels, 'publication status'); end if;

  if array_length(changed, 1) is not null then
    insert into public.card_offer_history (
      card_offer_id, change_summary, changed_fields, checked_at
    ) values (
      new.id,
      'Verified update: ' || array_to_string(labels, ', '),
      changed,
      new.last_checked_at
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_card_offer_history on public.card_offers;
create trigger trg_card_offer_history
  after update on public.card_offers
  for each row execute function public.record_card_offer_history();
