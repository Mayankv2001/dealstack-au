-- DealStack AU — transactional gift-card offer lifecycle orchestration
--
-- NOT APPLIED TO PRODUCTION. Requires explicit schema/data approval.
-- Apply after 023 (canonical approval lineage), 025 (immutable occurrences),
-- 030 (run_kind registry), and the forward 031 fixed-points reconciliation.
-- This migration never approves a candidate and never fetches a source.
--
-- The lifecycle state is deliberately separate from review_status:
--   approved-future — an admin-approved offer whose Sydney start has not arrived
--   active          — eligible for public reads (subject to RLS/date guards)
--   archived        — not public; the offer/evidence/revisions remain stored
--
-- Rollback is intentionally not advertised as lossless: dropping these columns
-- would discard transition state. Disable GIFT_CARD_LIFECYCLE_ENABLED first,
-- retain the columns/RPC while recovering, and restore forward with a reviewed
-- migration. Immutable occurrence and audit rows must never be deleted.

-- Migration 025 used the database session's UTC current_date. At Sydney 07:00
-- that can still be the prior UTC date, so an offer that ended yesterday in
-- Sydney could not yet be sealed. Forward-correct both storage and RLS to the
-- business calendar before the lifecycle RPC is installed.
do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.gift_card_offer_occurrences'::pg_catalog.regclass
      and constraint_row.contype = 'c'
      and pg_catalog.upper(pg_catalog.pg_get_constraintdef(constraint_row.oid))
        like '%END_DATE < CURRENT_DATE%'
  loop
    execute pg_catalog.format(
      'alter table public.gift_card_offer_occurrences drop constraint %I',
      v_constraint
    );
  end loop;
end;
$$;
alter table public.gift_card_offer_occurrences
  drop constraint if exists gift_card_offer_occurrences_end_date_sydney_check;
alter table public.gift_card_offer_occurrences
  add constraint gift_card_offer_occurrences_end_date_sydney_check
  check (
    end_date < pg_catalog.timezone('Australia/Sydney', sealed_at)::date
  );

drop policy if exists "public read sealed gift card occurrences"
  on public.gift_card_offer_occurrences;
create policy "public read sealed gift card occurrences"
  on public.gift_card_offer_occurrences for select to anon, authenticated
  using (
    sealed_at is not null
    and end_date < pg_catalog.timezone('Australia/Sydney', pg_catalog.now())::date
  );

-- Migration 024 embedded session-UTC current_date in both row constraints and
-- public policies. Temporal visibility belongs in Sydney-aware RLS, not in a
-- CHECK that silently becomes false as time passes. Replace only the two
-- generated public-shape checks, retaining every mechanic constraint.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_def.conrelid, constraint_def.conname
    from pg_catalog.pg_constraint constraint_def
    where constraint_def.conrelid in (
        'public.gift_card_programmes'::pg_catalog.regclass,
        'public.gift_card_programme_rates'::pg_catalog.regclass
      )
      and constraint_def.contype = 'c'
      and pg_catalog.pg_get_constraintdef(constraint_def.oid) ilike
        '%review_by_date%current_date%'
  loop
    execute pg_catalog.format(
      'alter table %s drop constraint %I',
      constraint_row.conrelid::pg_catalog.regclass,
      constraint_row.conname
    );
  end loop;
end;
$$;

alter table public.gift_card_programmes
  drop constraint if exists gift_card_programmes_public_shape_check;
alter table public.gift_card_programmes
  add constraint gift_card_programmes_public_shape_check check (
    not is_published or (confidence = 'confirmed' and is_ongoing)
  );

alter table public.gift_card_programme_rates
  drop constraint if exists gift_card_programme_rates_public_shape_check;
alter table public.gift_card_programme_rates
  add constraint gift_card_programme_rates_public_shape_check check (
    not is_published or (
      is_active
      and confidence = 'confirmed'
      and case promotion_type
        when 'discount' then discount_percent > 0 and discount_percent < 100
        when 'fixed-dollar-discount' then
          fixed_discount_dollars > 0 and threshold_dollars > 0
        when 'bonus-value' then bonus_percent > 0
        when 'fee-waiver' then true
        else false
      end
    )
  );

drop policy if exists "public read current gift_card_programmes"
  on public.gift_card_programmes;
create policy "public read current gift_card_programmes"
  on public.gift_card_programmes for select to anon, authenticated
  using (
    is_published = true
    and confidence = 'confirmed'
    and is_ongoing = true
    and review_by_date >= (
      pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
    )::date
  );

drop policy if exists "public read current gift_card_programme_rates"
  on public.gift_card_programme_rates;
create policy "public read current gift_card_programme_rates"
  on public.gift_card_programme_rates for select to anon, authenticated
  using (
    is_published = true
    and is_active = true
    and confidence = 'confirmed'
    and review_by_date >= (
      pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
    )::date
    and (
      is_ongoing = true
      or valid_to >= (
        pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
      )::date
    )
    and exists (
      select 1
      from public.gift_card_programmes programme
      where programme.id = gift_card_programme_rates.programme_id
        and programme.is_published = true
        and programme.confidence = 'confirmed'
        and programme.review_by_date >= (
          pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
        )::date
    )
  );

-- Migration 025's nullable start_date in a UNIQUE constraint permits duplicate
-- NULL-start occurrences. Refuse migration with an actionable error rather than
-- deleting immutable evidence, then add the coalesced business-identity index.
do $$
begin
  if exists (
    select 1
    from public.gift_card_offer_occurrences
    group by seller_key, product_key, promotion_type,
      coalesce(start_date, '-infinity'::date), end_date, source_url
    having count(*) > 1
  ) then
    raise exception using
      message = 'Duplicate gift-card occurrence identities must be reviewed before migration 032.',
      hint = 'Append a reviewed correction plan; do not delete immutable occurrence evidence automatically.';
  end if;
end;
$$;

create unique index if not exists idx_gc_occurrence_business_identity
  on public.gift_card_offer_occurrences (
    seller_key, product_key, promotion_type,
    coalesce(start_date, '-infinity'::date), end_date, source_url
  );

alter table public.gift_card_offers
  add column if not exists lifecycle_state text
    check (lifecycle_state in ('approved-future', 'active', 'archived')),
  add column if not exists lifecycle_activated_at timestamptz,
  add column if not exists lifecycle_archived_at timestamptz;

-- Preserve the meaning of existing visibility. Future rows are converted to a
-- private approved-future state; current rows remain active. Unpublished legacy
-- rows remain archived and are never inferred to be approved.
--
-- Migration 031 deliberately keeps the reviewed public-accuracy constraint
-- NOT VALID because production contains legacy published rows awaiting review.
-- PostgreSQL still checks a NOT VALID constraint on UPDATE, so a lifecycle-only
-- backfill would otherwise fail on those pre-existing facts. Drop and restore
-- the identical NOT VALID boundary around only these two controlled updates;
-- no offer fact or visibility is broadened.
alter table public.gift_card_offers
  drop constraint if exists gift_card_offers_public_accuracy_check;

update public.gift_card_offers
set lifecycle_state = case
  when is_published and start_date is not null
    and start_date > (statement_timestamp() at time zone 'Australia/Sydney')::date
    then 'approved-future'
  when is_published then 'active'
  else 'archived'
end
where lifecycle_state is null;

update public.gift_card_offers
set is_published = false
where lifecycle_state = 'approved-future'
  and is_published = true;

alter table public.gift_card_offers
  add constraint gift_card_offers_public_accuracy_check check (
    not is_published or (
      nullif(pg_catalog.btrim(brand), '') is not null
      and nullif(
        pg_catalog.btrim(coalesce(seller_name, purchase_location)), ''
      ) is not null
      and source_detail_url ~ '^https://'
      and promotion_type <> 'mixed'
      and (
        (expiry_date is not null and not is_ongoing)
        or (expiry_date is null and is_ongoing)
      )
      and case promotion_type
        when 'discount' then discount_percent > 0 and discount_percent < 100
          and reward_destination = 'checkout-discount'
        when 'fixed-dollar-discount' then fixed_discount_dollars > 0
          and threshold_dollars > 0 and reward_destination = 'checkout-discount'
        when 'bonus-value' then bonus_percent > 0
          and reward_destination = 'gift-card-value'
        when 'points' then (
          coalesce(points_multiplier, 0) > 0
          or coalesce(fixed_points, 0) > 0
        )
          and not (
            coalesce(points_multiplier, 0) > 0
            and coalesce(fixed_points, 0) > 0
          )
          and nullif(pg_catalog.btrim(points_program), '') is not null
          and reward_destination = 'loyalty-points'
        when 'promo-credit' then promo_credit_dollars > 0
          and threshold_dollars > 0 and reward_destination = 'seller-credit'
        when 'fee-waiver' then reward_destination = 'waived-fee'
        when 'membership' then discount_percent > 0 and membership_required
          and reward_destination = 'checkout-discount'
        else false
      end
    )
  ) not valid;

alter table public.gift_card_offers
  alter column lifecycle_state set default 'archived',
  alter column lifecycle_state set not null;

create index if not exists idx_gc_offers_lifecycle_due
  on public.gift_card_offers (lifecycle_state, start_date, expiry_date);

-- Keep every future approval private even if an older approval RPC requests
-- is_published=true. At/after the start date a reviewed manual publish becomes
-- active; an unpublish becomes archived. The transactional lifecycle RPC below
-- uses the same trigger, so direct and scheduled writes cannot disagree.
create or replace function public.sync_gift_card_offer_lifecycle_state()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := (pg_catalog.statement_timestamp() at time zone 'Australia/Sydney')::date;
begin
  if new.is_published then
    if new.start_date is not null and new.start_date > v_today then
      new.is_published := false;
      new.lifecycle_state := 'approved-future';
      new.lifecycle_activated_at := null;
      new.lifecycle_archived_at := null;
    else
      new.lifecycle_state := 'active';
      new.lifecycle_activated_at := coalesce(new.lifecycle_activated_at, pg_catalog.statement_timestamp());
      new.lifecycle_archived_at := null;
    end if;
  elsif tg_op = 'UPDATE' and old.is_published and not new.is_published then
    new.lifecycle_state := 'archived';
    new.lifecycle_archived_at := coalesce(new.lifecycle_archived_at, pg_catalog.statement_timestamp());
  elsif tg_op = 'UPDATE'
    and not new.is_published
    and old.lifecycle_state = 'approved-future'
    and new.lifecycle_state = old.lifecycle_state then
    -- An explicit false→false visibility update is how the pre-032 admin
    -- unpublish path cancels a future approval. Do not reactivate it later.
    new.lifecycle_state := 'archived';
    new.lifecycle_archived_at := coalesce(new.lifecycle_archived_at, pg_catalog.statement_timestamp());
  else
    new.lifecycle_state := coalesce(new.lifecycle_state, 'archived');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gc_offer_lifecycle_state on public.gift_card_offers;
create trigger trg_gc_offer_lifecycle_state
  before insert or update of is_published, start_date, lifecycle_state
  on public.gift_card_offers
  for each row execute function public.sync_gift_card_offer_lifecycle_state();

-- Pipeline-linked rows must finish the transaction with an approved candidate
-- that points back to the same offer. DEFERRABLE is essential: the existing
-- approval RPC upserts the offer first and marks the candidate approved later
-- in the same transaction. Legacy manually-reviewed rows have null lineage and
-- remain valid; stripping established lineage from a managed active row fails.
do $$
begin
  if exists (
    select 1
    from public.gift_card_offers offer
    where offer.source_candidate_id is not null
      and offer.lifecycle_state in ('approved-future', 'active')
      and not exists (
        select 1
        from public.gift_card_offer_candidates candidate
        where candidate.id = offer.source_candidate_id
          and candidate.review_status = 'approved'
          and candidate.approved_offer_id = offer.id
      )
  ) then
    raise exception using
      message = 'Pipeline-linked gift-card offers without approved lineage block migration 032.',
      hint = 'Review and repair the candidate-to-offer link; do not auto-publish or discard the evidence.';
  end if;
end;
$$;

create or replace function public.enforce_gift_card_offer_approval_lineage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.source_candidate_id is not null
    and new.source_candidate_id is null then
    raise exception 'Approved pipeline lineage cannot be removed from a managed offer.';
  end if;

  if new.source_candidate_id is not null
    and new.lifecycle_state in ('approved-future', 'active')
    and not exists (
      select 1
      from public.gift_card_offer_candidates candidate
      where candidate.id = new.source_candidate_id
        and candidate.review_status = 'approved'
        and candidate.approved_offer_id = new.id
    ) then
    raise exception 'A managed gift-card offer requires approved candidate lineage.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gc_offer_approval_lineage on public.gift_card_offers;
create constraint trigger trg_gc_offer_approval_lineage
  after insert or update on public.gift_card_offers
  deferrable initially deferred
  for each row execute function public.enforce_gift_card_offer_approval_lineage();

-- One transaction performs every transition. Each offer is handled in a PL/pgSQL
-- exception subtransaction: history + visibility + audit either all succeed for
-- that offer or all roll back, while one malformed legacy row cannot block the
-- independently-safe transition of another reviewed row.
create or replace function public.apply_gift_card_offer_lifecycle(
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_offer public.gift_card_offers%rowtype;
  v_activated text[] := '{}'::text[];
  v_archived text[] := '{}'::text[];
  v_history text[] := '{}'::text[];
  v_affected_stores text[] := '{}'::text[];
  v_errors jsonb := '[]'::jsonb;
  v_fixed_dollars numeric;
  v_seller text;
  v_seller_key text;
  v_product_key text;
begin
  if p_now is null then
    raise exception 'A lifecycle clock is required.';
  end if;
  v_today := (p_now at time zone 'Australia/Sydney')::date;

  -- Serialise direct RPC calls as a backstop to migration 030's global run lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dealstack:gift-card-lifecycle', 0)
  );

  for v_offer in
    select offer.*
    from public.gift_card_offers offer
    where offer.lifecycle_state = 'approved-future'
      and offer.start_date is not null
      and offer.start_date <= v_today
      and (
        (offer.is_ongoing and offer.expiry_date is null)
        or (not offer.is_ongoing and offer.expiry_date is not null and offer.expiry_date >= v_today)
      )
      and offer.source_candidate_id is not null
      and exists (
        select 1
        from public.gift_card_offer_candidates candidate
        where candidate.id = offer.source_candidate_id
          and candidate.review_status = 'approved'
          and candidate.approved_offer_id = offer.id
      )
    order by offer.id
    for update of offer
  loop
    begin
      update public.gift_card_offers
      set is_published = true,
          lifecycle_state = 'active',
          lifecycle_activated_at = p_now,
          lifecycle_archived_at = null
      where id = v_offer.id
        and lifecycle_state = 'approved-future';

      if found then
        insert into public.audit_log(actor_email, action, table_name, row_id, diff)
        values (
          'system@dealstack.local', 'activate-gift-card-offer',
          'gift_card_offers', v_offer.id,
          pg_catalog.jsonb_build_object(
            'before', pg_catalog.jsonb_build_object(
              'is_published', false, 'lifecycle_state', 'approved-future'
            ),
            'after', pg_catalog.jsonb_build_object(
              'is_published', true, 'lifecycle_state', 'active'
            ),
            'sydneyDate', v_today,
            'sourceCandidateId', v_offer.source_candidate_id
          )
        );
        v_activated := pg_catalog.array_append(v_activated, v_offer.id);
        v_affected_stores := v_affected_stores || coalesce(v_offer.accepted_at_merchant_ids, '{}'::text[]);
      end if;
    exception when others then
      v_errors := v_errors || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'offerId', v_offer.id, 'step', 'activate', 'error', sqlerrm
        )
      );
    end;
  end loop;

  for v_offer in
    select offer.*
    from public.gift_card_offers offer
    where not offer.is_ongoing
      and offer.expiry_date is not null
      and offer.expiry_date < v_today
      and (
        (offer.is_published and offer.lifecycle_state = 'active')
        or (
          offer.lifecycle_state = 'approved-future'
          and offer.source_candidate_id is not null
          and exists (
            select 1
            from public.gift_card_offer_candidates candidate
            where candidate.id = offer.source_candidate_id
              and candidate.review_status = 'approved'
              and candidate.approved_offer_id = offer.id
          )
        )
      )
    order by offer.id
    for update of offer
  loop
    begin
      v_seller := nullif(pg_catalog.btrim(coalesce(v_offer.seller_name, v_offer.purchase_location)), '');
      if v_seller is null or nullif(pg_catalog.btrim(v_offer.brand), '') is null then
        raise exception 'Seller and product brand are required before sealing history.';
      end if;
      if v_offer.source_detail_url is null or v_offer.source_detail_url !~ '^https://' then
        raise exception 'A safe offer-level HTTPS source is required before sealing history.';
      end if;

      v_fixed_dollars := case v_offer.promotion_type
        when 'fixed-dollar-discount' then v_offer.fixed_discount_dollars
        when 'promo-credit' then v_offer.promo_credit_dollars
        when 'fee-waiver' then v_offer.fee_waiver_dollars
        else null
      end;
      v_seller_key := pg_catalog.left(
        pg_catalog.btrim(pg_catalog.regexp_replace(
          pg_catalog.lower(v_seller), '[^a-z0-9]+', '-', 'g'
        ), '-'), 100
      );
      v_product_key := coalesce(
        nullif(pg_catalog.btrim(v_offer.product_id), ''),
        pg_catalog.left(
          pg_catalog.btrim(pg_catalog.regexp_replace(
            pg_catalog.lower(v_offer.brand), '[^a-z0-9]+', '-', 'g'
          ), '-'), 100
        )
      );

      if not exists (
        select 1 from public.gift_card_offer_occurrences occurrence
        where occurrence.source_offer_id = v_offer.id
      ) then
        insert into public.gift_card_offer_occurrences (
          source_offer_id, seller_key, seller_name, product_key, product_name,
          promotion_type, discount_percent, fixed_dollars, bonus_percent,
          points_multiplier, fixed_points, points_programme, threshold_dollars,
          start_date, end_date, source_url, verified_at, sealed_at
        ) values (
          v_offer.id, v_seller_key, v_seller, v_product_key, v_offer.brand,
          v_offer.promotion_type,
          case when v_offer.promotion_type in ('discount', 'membership')
            then v_offer.discount_percent else null end,
          v_fixed_dollars,
          case when v_offer.promotion_type = 'bonus-value'
            then v_offer.bonus_percent else null end,
          case when v_offer.promotion_type = 'points'
            then v_offer.points_multiplier else null end,
          case when v_offer.promotion_type = 'points'
            then v_offer.fixed_points else null end,
          case when v_offer.promotion_type = 'points'
            then v_offer.points_program else null end,
          v_offer.threshold_dollars, v_offer.start_date, v_offer.expiry_date,
          v_offer.source_detail_url, v_offer.last_checked_at, p_now
        ) on conflict do nothing;
      end if;

      update public.gift_card_offers
      set is_published = false,
          lifecycle_state = 'archived',
          lifecycle_archived_at = p_now
      where id = v_offer.id
        and lifecycle_state in ('active', 'approved-future');

      if found then
        insert into public.audit_log(actor_email, action, table_name, row_id, diff)
        values (
          'system@dealstack.local', 'archive-gift-card-offer',
          'gift_card_offers', v_offer.id,
          pg_catalog.jsonb_build_object(
            'before', pg_catalog.jsonb_build_object(
              'is_published', v_offer.is_published,
              'lifecycle_state', v_offer.lifecycle_state
            ),
            'after', pg_catalog.jsonb_build_object(
              'is_published', false, 'lifecycle_state', 'archived'
            ),
            'sydneyDate', v_today,
            'historySealed', true
          )
        );
        v_archived := pg_catalog.array_append(v_archived, v_offer.id);
        v_history := pg_catalog.array_append(v_history, v_offer.id);
        v_affected_stores := v_affected_stores || coalesce(v_offer.accepted_at_merchant_ids, '{}'::text[]);
      end if;
    exception when others then
      v_errors := v_errors || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'offerId', v_offer.id, 'step', 'archive', 'error', sqlerrm
        )
      );
    end;
  end loop;

  return pg_catalog.jsonb_build_object(
    'sydneyDate', v_today,
    'activatedOfferIds', v_activated,
    'archivedOfferIds', v_archived,
    'historySealedOfferIds', v_history,
    'affectedStoreIds', coalesce((
      select pg_catalog.array_agg(distinct store_id order by store_id)
      from pg_catalog.unnest(v_affected_stores) store_id
      where nullif(pg_catalog.btrim(store_id), '') is not null
    ), '{}'::text[]),
    'errors', v_errors
  );
end;
$$;

revoke all on function public.apply_gift_card_offer_lifecycle(timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_gift_card_offer_lifecycle(timestamptz)
  to service_role;

revoke all on function public.sync_gift_card_offer_lifecycle_state()
  from public, anon, authenticated;
revoke all on function public.enforce_gift_card_offer_approval_lineage()
  from public, anon, authenticated;
