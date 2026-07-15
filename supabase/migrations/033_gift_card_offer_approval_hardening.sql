-- DealStack AU — gift-card offer approval identity/publication hardening
--
-- FORWARD-ONLY / NOT APPLIED. Migration 023 is already recorded in production
-- and must not be rewritten as a recovery mechanism. This migration requires
-- 031 (fixed_points convergence) and 032 (Sydney lifecycle + deferred lineage).
-- It replaces only the approval boundary and public-read policy; it does not
-- approve a candidate, publish data, fetch a source, or backfill offer facts.

-- Existing legacy rows remain stored. NOT VALID deliberately avoids rejecting
-- previously-published rows during rollout, while every subsequent insert or
-- update must keep reviewed lifecycle states confirmed. The RLS replacement
-- immediately hides unconfirmed, future, expired, or inconsistent rows.
alter table public.gift_card_offers
  drop constraint if exists gift_card_offers_reviewed_lifecycle_check;
alter table public.gift_card_offers
  add constraint gift_card_offers_reviewed_lifecycle_check check (
    lifecycle_state = 'archived'
    or confidence = 'confirmed'
  ) not valid;

alter table public.gift_card_offers
  drop constraint if exists gift_card_offers_fee_waiver_value_check;
alter table public.gift_card_offers
  add constraint gift_card_offers_fee_waiver_value_check check (
    promotion_type <> 'fee-waiver'
    or fee_waiver_dollars > 0
  ) not valid;

drop policy if exists "public read published gift_card_offers"
  on public.gift_card_offers;
drop policy if exists "public read current confirmed gift_card_offers"
  on public.gift_card_offers;
create policy "public read current confirmed gift_card_offers"
  on public.gift_card_offers for select to anon, authenticated
  using (
    is_published = true
    and confidence = 'confirmed'
    and lifecycle_state = 'active'
    and (
      start_date is null
      or start_date <= (
        pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
      )::date
    )
    and (
      (is_ongoing = true and expiry_date is null)
      or (
        is_ongoing = false
        and expiry_date is not null
        and expiry_date >= (
          pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
        )::date
      )
    )
  );

-- Preserve already-visible legacy rows, but do not allow a new/restored public
-- or approved-future state without candidate lineage. The deferred constraint
-- trigger installed by 032 verifies the linked candidate is approved and points
-- back to this exact offer at transaction end.
create or replace function public.guard_gift_card_offer_publication_lineage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.is_published or new.lifecycle_state = 'approved-future')
    and new.source_candidate_id is null then
    if tg_op = 'UPDATE' then
      if old.is_published
        and old.lifecycle_state = 'active'
        and old.source_candidate_id is null
        and new.is_published
        and new.lifecycle_state = 'active' then
        return new;
      end if;
    end if;
    raise exception 'A new public or approved-future gift-card offer requires reviewed candidate lineage.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gc_offer_publication_lineage
  on public.gift_card_offers;
create trigger trg_gc_offer_publication_lineage
  before insert or update of is_published, lifecycle_state, source_candidate_id
  on public.gift_card_offers
  for each row execute function public.guard_gift_card_offer_publication_lineage();

revoke all on function public.guard_gift_card_offer_publication_lineage()
  from public, anon, authenticated;

-- Canonical reviewed approval. The candidate and chosen offer identity are
-- serialised together; candidate lineage, mechanic/date rules, canonical
-- upsert, candidate link and audit row commit atomically.
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
  raw_item public.gift_card_raw_items%rowtype;
  source_row public.gift_card_sources%rowtype;
  existing_offer public.gift_card_offers%rowtype;
  v_offer_exists boolean := false;
  v_offer_id text;
  v_mechanic text;
  v_reward_destination text;
  v_start_date date;
  v_expiry_date date;
  v_is_ongoing boolean;
  v_today date := (
    pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
  )::date;
  v_lifecycle_state text;
begin
  v_offer_id := pg_catalog.btrim(coalesce(p_offer_id, ''));
  if v_offer_id = '' or v_offer_id <> p_offer_id then
    raise exception 'A canonical offer ID without surrounding whitespace is required.';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_reviewer, '')), '') is null then
    raise exception 'Reviewer identity is required.';
  end if;
  if p_offer is null or pg_catalog.jsonb_typeof(p_offer) <> 'object' then
    raise exception 'Reviewed offer facts are required.';
  end if;

  select * into candidate
  from public.gift_card_offer_candidates
  where id = p_candidate_id
  for update;

  if not found then raise exception 'Candidate not found.'; end if;

  -- An exact delivery retry is a no-op. Any attempt to reuse an approved
  -- candidate for another offer remains an error.
  if candidate.review_status = 'approved' then
    if candidate.approved_offer_id = v_offer_id and exists (
      select 1
      from public.gift_card_offers offer
      where offer.id = v_offer_id
        and offer.source_candidate_id = candidate.id
    ) then
      return v_offer_id;
    end if;
    raise exception 'Candidate is already approved for a different canonical lineage.';
  end if;
  if candidate.review_status not in ('new', 'changed') then
    raise exception 'Candidate is no longer awaiting review.';
  end if;
  if not candidate.source_present then
    raise exception 'Removed sub-offers cannot be approved.';
  end if;
  if candidate.candidate_role in ('compound-summary', 'catalogue-rate') then
    raise exception 'This candidate role cannot publish a one-off offer.';
  end if;

  select * into raw_item
  from public.gift_card_raw_items
  where id = candidate.raw_item_id;
  select * into source_row
  from public.gift_card_sources
  where id = candidate.source_id;
  if raw_item.id is null or raw_item.source_id <> candidate.source_id then
    raise exception 'Stored source item lineage is required.';
  end if;
  if raw_item.processing_status is distinct from 'parsed' then
    raise exception 'Only a successfully parsed source item may be approved.';
  end if;
  if source_row.id is null or nullif(pg_catalog.btrim(source_row.name), '') is null then
    raise exception 'Stored source identity is required.';
  end if;
  if raw_item.canonical_url !~ '^https://' then
    raise exception 'A source URL is required.';
  end if;
  if raw_item.campaign_kind = 'compound' and (
    raw_item.split_review_status <> 'split-complete'
    or candidate.candidate_role <> 'suboffer'
    or candidate.suboffer_key = 'primary'
  ) then
    raise exception 'Compound campaigns must be split into stable sub-offers before approval.';
  end if;

  -- Prevent two different candidate transactions from racing to claim the same
  -- text ID when neither could see the other's uncommitted insert.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dealstack:gift-card-offer:' || v_offer_id, 0)
  );
  select * into existing_offer
  from public.gift_card_offers
  where id = v_offer_id
  for update;
  v_offer_exists := found;

  if candidate.approved_offer_id is not null then
    if candidate.approved_offer_id <> v_offer_id then
      raise exception 'A changed candidate may update only its linked canonical offer.';
    end if;
    if not v_offer_exists then
      raise exception 'The candidate-linked canonical offer was not found.';
    end if;
  end if;

  if v_offer_exists and (
    existing_offer.source_id is distinct from candidate.source_id
    or existing_offer.source_raw_item_id is distinct from candidate.raw_item_id
    or existing_offer.source_suboffer_key is distinct from candidate.suboffer_key
  ) then
    raise exception 'The selected offer ID belongs to unrelated source lineage.';
  end if;

  if p_offer->>'confidence' is distinct from 'confirmed' then
    raise exception 'Publication requires confirmed reviewed evidence.';
  end if;
  v_mechanic := p_offer->>'promotion_type';
  v_reward_destination := p_offer->>'reward_destination';
  if v_mechanic is null or v_mechanic in ('unknown', 'mixed') then
    raise exception 'A known atomic promotion type is required.';
  end if;
  if nullif(pg_catalog.btrim(p_offer->>'brand'), '') is null then
    raise exception 'Brand is required.';
  end if;
  if nullif(pg_catalog.btrim(p_offer->>'purchase_location'), '') is null then
    raise exception 'Seller is required.';
  end if;

  v_start_date := (p_offer->>'start_date')::date;
  v_expiry_date := (p_offer->>'expiry_date')::date;
  v_is_ongoing := coalesce((p_offer->>'is_ongoing')::boolean, false);
  if v_expiry_date is null and not v_is_ongoing then
    raise exception 'Expiry is required unless explicitly ongoing.';
  end if;
  if v_expiry_date is not null and v_is_ongoing then
    raise exception 'An offer cannot be dated and ongoing.';
  end if;
  if v_start_date is not null and v_expiry_date is not null
    and v_start_date > v_expiry_date then
    raise exception 'Offer start date cannot follow its expiry date.';
  end if;
  if v_expiry_date is not null and v_expiry_date < v_today then
    raise exception 'An expired candidate cannot be approved as a canonical current offer.';
  end if;
  v_lifecycle_state := case
    when v_start_date is not null and v_start_date > v_today
      then 'approved-future'
    else 'active'
  end;

  if v_mechanic = 'discount' and not coalesce((
    (p_offer->>'discount_percent')::numeric > 0
    and (p_offer->>'discount_percent')::numeric < 100
    and v_reward_destination = 'checkout-discount'
  ), false) then raise exception 'Discounts require a percentage between 0 and 100 and checkout-discount destination.';
  elsif v_mechanic = 'fixed-dollar-discount' and not coalesce((
    (p_offer->>'fixed_discount_dollars')::numeric > 0
    and (p_offer->>'threshold_dollars')::numeric > 0
    and v_reward_destination = 'checkout-discount'
  ), false) then raise exception 'Fixed-dollar discounts require a positive amount, threshold, and checkout-discount destination.';
  elsif v_mechanic = 'bonus-value' and not coalesce((
    (p_offer->>'bonus_percent')::numeric > 0
    and v_reward_destination = 'gift-card-value'
  ), false) then raise exception 'Bonus value requires a positive percentage and gift-card-value destination.';
  elsif v_mechanic = 'points' and (
    (coalesce((p_offer->>'points_multiplier')::numeric, 0) <= 0
      and coalesce((p_offer->>'fixed_points')::numeric, 0) <= 0)
    or (coalesce((p_offer->>'points_multiplier')::numeric, 0) > 0
      and coalesce((p_offer->>'fixed_points')::numeric, 0) > 0)
    or nullif(pg_catalog.btrim(p_offer->>'points_program'), '') is null
    or v_reward_destination <> 'loyalty-points'
  ) then raise exception 'Points require exactly one positive value, a programme, and loyalty-points destination.';
  elsif v_mechanic = 'promo-credit' and not coalesce((
    (p_offer->>'promo_credit_dollars')::numeric > 0
    and (p_offer->>'threshold_dollars')::numeric > 0
    and v_reward_destination = 'seller-credit'
  ), false) then raise exception 'Promo credits require a positive amount, threshold, and seller-credit destination.';
  elsif v_mechanic = 'fee-waiver' and not coalesce((
    (p_offer->>'fee_waiver_dollars')::numeric > 0
    and v_reward_destination = 'waived-fee'
  ), false) then
    raise exception 'Fee waivers require a positive waived amount and waived-fee destination.';
  elsif v_mechanic = 'membership' and not coalesce((
    (p_offer->>'discount_percent')::numeric > 0
    and coalesce((p_offer->>'membership_required')::boolean, false)
    and v_reward_destination = 'checkout-discount'
  ), false) then raise exception 'Membership rates require a positive percentage, membership flag, and checkout-discount destination.';
  elsif v_mechanic not in (
    'discount', 'fixed-dollar-discount', 'bonus-value', 'points',
    'promo-credit', 'fee-waiver', 'membership'
  ) then raise exception 'Unsupported promotion type.';
  end if;

  insert into public.gift_card_offers (
    id, brand, discount_percent, channel, source,
    accepted_at_merchant_ids, points_on_purchase, cap_dollars,
    expiry_date, start_date, purchase_location, purchase_method,
    limit_per_customer, accepted_at, usage_notes, stack_notes,
    source_detail_url, citations, confidence, last_checked_at, is_published,
    promotion_type, bonus_percent, points_multiplier, fixed_points, points_program,
    points_value_cents, membership_required, activation_required,
    coupon_required, min_spend, denomination_note, format, source_name,
    product_id, source_last_seen_at, promo_code, expiry_time, expiry_timezone,
    uses_per_customer, shipping_may_apply, australia_only,
    combinable_with_seller_promotions, terms_url, included_product_ids,
    seller_name, source_id, source_raw_item_id, source_candidate_id,
    source_suboffer_key, reward_destination, fixed_discount_dollars,
    promo_credit_dollars, fee_waiver_dollars, threshold_dollars,
    is_ongoing, targeted, lifecycle_state
  ) values (
    v_offer_id, p_offer->>'brand', coalesce((p_offer->>'discount_percent')::numeric, 0),
    coalesce(p_offer->>'channel', 'supermarket-promo'), source_row.name,
    coalesce((select pg_catalog.array_agg(x) from pg_catalog.jsonb_array_elements_text(p_offer->'accepted_at_merchant_ids') x), '{}'::text[]),
    p_offer->'points_on_purchase', (p_offer->>'cap_dollars')::numeric,
    v_expiry_date, v_start_date, p_offer->>'purchase_location',
    coalesce(p_offer->>'purchase_method', 'unknown'), p_offer->>'limit_per_customer',
    coalesce((select pg_catalog.array_agg(x) from pg_catalog.jsonb_array_elements_text(p_offer->'accepted_at') x), '{}'::text[]),
    coalesce((select pg_catalog.array_agg(x) from pg_catalog.jsonb_array_elements_text(p_offer->'usage_notes') x), '{}'::text[]),
    coalesce((select pg_catalog.array_agg(x) from pg_catalog.jsonb_array_elements_text(p_offer->'stack_notes') x), '{}'::text[]),
    raw_item.canonical_url, coalesce(p_offer->'citations', '[]'::jsonb),
    'confirmed', pg_catalog.statement_timestamp(), true,
    v_mechanic, (p_offer->>'bonus_percent')::numeric,
    (p_offer->>'points_multiplier')::numeric, (p_offer->>'fixed_points')::numeric,
    p_offer->>'points_program', (p_offer->>'points_value_cents')::numeric,
    coalesce((p_offer->>'membership_required')::boolean, false),
    coalesce((p_offer->>'activation_required')::boolean, false),
    coalesce((p_offer->>'coupon_required')::boolean, false),
    (p_offer->>'min_spend')::numeric, p_offer->>'denomination_note',
    coalesce(p_offer->>'format', 'unknown'), source_row.name,
    nullif(p_offer->>'product_id', ''), pg_catalog.statement_timestamp(),
    nullif(p_offer->>'promo_code', ''), nullif(p_offer->>'expiry_time', ''),
    nullif(p_offer->>'expiry_timezone', ''), (p_offer->>'uses_per_customer')::integer,
    coalesce((p_offer->>'shipping_may_apply')::boolean, false),
    (p_offer->>'australia_only')::boolean,
    (p_offer->>'combinable_with_seller_promotions')::boolean,
    nullif(p_offer->>'terms_url', ''),
    coalesce((select pg_catalog.array_agg(x) from pg_catalog.jsonb_array_elements_text(p_offer->'included_product_ids') x), '{}'::text[]),
    p_offer->>'purchase_location', candidate.source_id, candidate.raw_item_id,
    candidate.id, candidate.suboffer_key, v_reward_destination,
    (p_offer->>'fixed_discount_dollars')::numeric,
    (p_offer->>'promo_credit_dollars')::numeric,
    (p_offer->>'fee_waiver_dollars')::numeric,
    (p_offer->>'threshold_dollars')::numeric, v_is_ongoing,
    coalesce((p_offer->>'targeted')::boolean, false), v_lifecycle_state
  )
  on conflict (id) do update set
    brand = excluded.brand, discount_percent = excluded.discount_percent,
    channel = excluded.channel, source = excluded.source,
    accepted_at_merchant_ids = excluded.accepted_at_merchant_ids,
    points_on_purchase = excluded.points_on_purchase, cap_dollars = excluded.cap_dollars,
    expiry_date = excluded.expiry_date, start_date = excluded.start_date,
    purchase_location = excluded.purchase_location, purchase_method = excluded.purchase_method,
    limit_per_customer = excluded.limit_per_customer, accepted_at = excluded.accepted_at,
    usage_notes = excluded.usage_notes, stack_notes = excluded.stack_notes,
    source_detail_url = excluded.source_detail_url, citations = excluded.citations,
    confidence = 'confirmed', last_checked_at = excluded.last_checked_at,
    -- Request publication and let 032's BEFORE trigger convert future rows to
    -- is_published=false / approved-future. Using excluded.is_published here
    -- would carry the INSERT trigger's converted false value into an UPDATE and
    -- incorrectly archive a currently-active target.
    is_published = true, promotion_type = excluded.promotion_type,
    bonus_percent = excluded.bonus_percent, points_multiplier = excluded.points_multiplier,
    fixed_points = excluded.fixed_points, points_program = excluded.points_program,
    points_value_cents = excluded.points_value_cents,
    membership_required = excluded.membership_required,
    activation_required = excluded.activation_required,
    coupon_required = excluded.coupon_required, min_spend = excluded.min_spend,
    denomination_note = excluded.denomination_note, format = excluded.format,
    source_name = excluded.source_name, product_id = excluded.product_id,
    source_last_seen_at = excluded.source_last_seen_at, promo_code = excluded.promo_code,
    expiry_time = excluded.expiry_time, expiry_timezone = excluded.expiry_timezone,
    uses_per_customer = excluded.uses_per_customer,
    shipping_may_apply = excluded.shipping_may_apply,
    australia_only = excluded.australia_only,
    combinable_with_seller_promotions = excluded.combinable_with_seller_promotions,
    terms_url = excluded.terms_url, included_product_ids = excluded.included_product_ids,
    seller_name = excluded.seller_name, source_id = excluded.source_id,
    source_raw_item_id = excluded.source_raw_item_id,
    source_candidate_id = excluded.source_candidate_id,
    source_suboffer_key = excluded.source_suboffer_key,
    reward_destination = excluded.reward_destination,
    fixed_discount_dollars = excluded.fixed_discount_dollars,
    promo_credit_dollars = excluded.promo_credit_dollars,
    fee_waiver_dollars = excluded.fee_waiver_dollars,
    threshold_dollars = excluded.threshold_dollars,
    is_ongoing = excluded.is_ongoing, targeted = excluded.targeted,
    lifecycle_state = v_lifecycle_state;

  update public.gift_card_offer_candidates
  set review_status = 'approved', reviewer_email = p_reviewer,
      reviewed_at = pg_catalog.statement_timestamp(), approved_offer_id = v_offer_id
  where id = p_candidate_id
    and review_status in ('new', 'changed');
  if not found then
    raise exception 'Candidate state changed before approval completed.';
  end if;

  insert into public.audit_log(actor_email, action, table_name, row_id, diff)
  values (
    p_reviewer, 'approve-gift-card-candidate', 'gift_card_offer_candidates',
    p_candidate_id, pg_catalog.jsonb_build_object(
      'offerId', v_offer_id,
      'promotionType', v_mechanic,
      'rawItemId', candidate.raw_item_id,
      'subofferKey', candidate.suboffer_key,
      'isPublished', v_lifecycle_state = 'active',
      'lifecycleState', v_lifecycle_state
    )
  );
  return v_offer_id;
end;
$$;

revoke all on function public.approve_gift_card_candidate(uuid, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.approve_gift_card_candidate(uuid, text, jsonb, text)
  to service_role;
