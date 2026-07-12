-- DealStack AU — gift-card accuracy and compound-campaign model (additive)
--
-- NOT APPLIED TO PRODUCTION. Apply only after the correction table in
-- docs/gift-card-offer-corrections-2026-07-12.md is explicitly approved.
-- Existing columns remain for backwards compatibility; new canonical fields
-- prevent a compound source, missing date, or mismatched mechanic from being
-- published. No data correction or publication occurs in this migration.

-- ── Parent source item: single vs compound ──────────────────────────────────
alter table public.gift_card_raw_items
  add column if not exists campaign_kind text not null default 'unknown'
    check (campaign_kind in ('unknown', 'single', 'compound', 'programme-catalogue')),
  add column if not exists split_review_status text not null default 'not-required'
    check (split_review_status in ('not-required', 'needs-split', 'split-complete'));

-- ── Private candidates: stable child identity + atomic mechanic ─────────────
alter table public.gift_card_offer_candidates
  drop constraint if exists gift_card_offer_candidates_promotion_type_check;
alter table public.gift_card_offer_candidates
  add constraint gift_card_offer_candidates_promotion_type_check
    check (promotion_type in (
      'discount', 'fixed-dollar-discount', 'bonus-value', 'points',
      'promo-credit', 'fee-waiver', 'membership', 'mixed', 'unknown'
    ));

alter table public.gift_card_offer_candidates
  add column if not exists suboffer_key text not null default 'primary',
  add column if not exists candidate_role text not null default 'single-offer'
    check (candidate_role in ('single-offer', 'suboffer', 'compound-summary', 'catalogue-rate')),
  add column if not exists source_fingerprint text,
  add column if not exists reward_destination text
    check (reward_destination in (
      'checkout-discount', 'gift-card-value', 'seller-credit',
      'loyalty-points', 'waived-fee'
    )),
  add column if not exists fixed_discount_dollars numeric,
  add column if not exists promo_credit_dollars numeric,
  add column if not exists fee_waiver_dollars numeric,
  add column if not exists threshold_dollars numeric,
  add column if not exists is_ongoing boolean not null default false,
  add column if not exists targeted boolean not null default false,
  add column if not exists source_present boolean not null default true,
  add column if not exists source_removed_at timestamptz;

alter table public.gift_card_offer_candidates
  add constraint gift_card_candidates_accuracy_values_check check (
    (fixed_discount_dollars is null or fixed_discount_dollars > 0) and
    (promo_credit_dollars is null or promo_credit_dollars > 0) and
    (fee_waiver_dollars is null or fee_waiver_dollars > 0) and
    (threshold_dollars is null or threshold_dollars > 0) and
    not (is_ongoing and expires_at is not null) and
    (source_present or source_removed_at is not null)
  );

-- Sync canonical columns from the bounded structured terms_json written by
-- the v2 ingester. This keeps the app compatible until generated DB types are
-- refreshed after an authorised migration apply.
create or replace function public.sync_gift_card_candidate_accuracy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.suboffer_key := coalesce(nullif(new.terms_json->>'subOfferKey', ''), new.suboffer_key, 'primary');
  new.candidate_role := coalesce(nullif(new.terms_json->>'candidateRole', ''), new.candidate_role, 'single-offer');
  new.reward_destination := coalesce(nullif(new.terms_json->>'rewardDestination', ''), new.reward_destination);
  new.fixed_discount_dollars := coalesce((new.terms_json->>'fixedDiscountDollars')::numeric, new.fixed_discount_dollars);
  new.promo_credit_dollars := coalesce((new.terms_json->>'promoCreditDollars')::numeric, new.promo_credit_dollars);
  new.fee_waiver_dollars := coalesce((new.terms_json->>'feeWaiverDollars')::numeric, new.fee_waiver_dollars);
  new.threshold_dollars := coalesce((new.terms_json->>'thresholdDollars')::numeric, new.threshold_dollars);
  new.is_ongoing := coalesce((new.terms_json->>'isOngoing')::boolean, new.is_ongoing, false);
  new.targeted := coalesce((new.terms_json->>'targeted')::boolean, new.targeted, false);
  new.source_present := coalesce(new.terms_json->>'sourcePresence', 'present') <> 'removed';
  if not new.source_present and new.source_removed_at is null then
    new.source_removed_at := now();
  end if;
  new.source_fingerprint := md5(jsonb_build_object(
    'seller', new.seller_name,
    'brands', new.gift_card_brands,
    'type', new.promotion_type,
    'discount', new.discount_percent,
    'fixed', new.fixed_discount_dollars,
    'bonus', new.bonus_percent,
    'points', new.points_multiplier,
    'program', new.points_program,
    'credit', new.promo_credit_dollars,
    'fee', new.fee_waiver_dollars,
    'threshold', new.threshold_dollars,
    'start', new.starts_at,
    'end', new.expires_at,
    'ongoing', new.is_ongoing,
    'targeted', new.targeted
  )::text);
  return new;
end;
$$;

drop trigger if exists trg_gc_candidate_accuracy on public.gift_card_offer_candidates;
create trigger trg_gc_candidate_accuracy
  before insert or update on public.gift_card_offer_candidates
  for each row execute function public.sync_gift_card_candidate_accuracy();

update public.gift_card_offer_candidates
set terms_json = terms_json
where true;

create unique index if not exists idx_gc_candidates_one_open_suboffer
  on public.gift_card_offer_candidates (raw_item_id, suboffer_key)
  where review_status in ('new', 'changed');
create index if not exists idx_gc_candidates_suboffer_history
  on public.gift_card_offer_candidates (raw_item_id, suboffer_key, created_at desc);

-- A fetched compound parent is complete only when at least two distinct atomic
-- children have been staged. A source item disappearing from the RSS window is
-- never treated as child removal; a `source-removed` review candidate is staged
-- only by the v2 orchestrator
-- only while the parent itself is present.
create or replace function public.refresh_gift_card_parent_split_state()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  child_count integer;
  has_summary boolean;
begin
  select
    count(distinct suboffer_key) filter (
      where candidate_role = 'suboffer' and source_present
    ),
    bool_or(candidate_role = 'compound-summary' and source_present)
  into child_count, has_summary
  from public.gift_card_offer_candidates
  where raw_item_id = new.raw_item_id;

  update public.gift_card_raw_items
  set campaign_kind = case
        when coalesce(has_summary, false) or child_count >= 2 then 'compound'
        else 'single'
      end,
      split_review_status = case
        when coalesce(has_summary, false) and child_count < 2 then 'needs-split'
        when child_count >= 2 then 'split-complete'
        else 'not-required'
      end
  where id = new.raw_item_id;
  return null;
end;
$$;

drop trigger if exists trg_gc_refresh_parent_split on public.gift_card_offer_candidates;
create trigger trg_gc_refresh_parent_split
  after insert or update on public.gift_card_offer_candidates
  for each row execute function public.refresh_gift_card_parent_split_state();

-- ── Public offer: canonical mechanic/value/date + source lineage ─────────────
alter table public.gift_card_offers
  drop constraint if exists gift_card_offers_promotion_type_check;
alter table public.gift_card_offers
  add constraint gift_card_offers_promotion_type_check
    check (promotion_type in (
      'discount', 'fixed-dollar-discount', 'bonus-value', 'points',
      'promo-credit', 'fee-waiver', 'membership', 'mixed'
    ));

alter table public.gift_card_offers
  add column if not exists seller_name text,
  add column if not exists source_id text references public.gift_card_sources (id) on delete set null,
  add column if not exists source_raw_item_id uuid references public.gift_card_raw_items (id) on delete set null,
  add column if not exists source_candidate_id uuid references public.gift_card_offer_candidates (id) on delete set null,
  add column if not exists source_suboffer_key text,
  add column if not exists reward_destination text
    check (reward_destination in (
      'checkout-discount', 'gift-card-value', 'seller-credit',
      'loyalty-points', 'waived-fee'
    )),
  add column if not exists fixed_discount_dollars numeric,
  add column if not exists promo_credit_dollars numeric,
  add column if not exists fee_waiver_dollars numeric,
  add column if not exists threshold_dollars numeric,
  add column if not exists is_ongoing boolean not null default false,
  add column if not exists targeted boolean not null default false;

update public.gift_card_offers
set seller_name = purchase_location
where seller_name is null and purchase_location is not null;

alter table public.gift_card_offers
  add constraint gift_card_offers_accuracy_values_check check (
    (fixed_discount_dollars is null or fixed_discount_dollars > 0) and
    (promo_credit_dollars is null or promo_credit_dollars > 0) and
    (fee_waiver_dollars is null or fee_waiver_dollars > 0) and
    (threshold_dollars is null or threshold_dollars > 0) and
    not (is_ongoing and expiry_date is not null)
  );

-- Transitional: existing inaccurate public rows are intentionally not
-- validated yet, but every newly published/updated public row must be complete.
alter table public.gift_card_offers
  add constraint gift_card_offers_public_accuracy_check check (
    not is_published or (
      nullif(btrim(brand), '') is not null and
      nullif(btrim(coalesce(seller_name, purchase_location)), '') is not null and
      source_detail_url ~ '^https://' and
      promotion_type <> 'mixed' and
      ((expiry_date is not null and not is_ongoing) or (expiry_date is null and is_ongoing)) and
      case promotion_type
        when 'discount' then discount_percent > 0 and discount_percent < 100
          and reward_destination = 'checkout-discount'
        when 'fixed-dollar-discount' then fixed_discount_dollars > 0
          and threshold_dollars > 0 and reward_destination = 'checkout-discount'
        when 'bonus-value' then bonus_percent > 0
          and reward_destination = 'gift-card-value'
        when 'points' then points_multiplier > 0
          and nullif(btrim(points_program), '') is not null
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

create index if not exists idx_gc_offers_source_suboffer
  on public.gift_card_offers (source_raw_item_id, source_suboffer_key);

-- ── Approval RPC: DB-level fail-closed guard and canonical persistence ───────
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
  mechanic text;
begin
  select * into candidate
  from public.gift_card_offer_candidates
  where id = p_candidate_id
  for update;

  if not found then raise exception 'Candidate not found.'; end if;
  if candidate.review_status not in ('new', 'changed') then
    raise exception 'Candidate is no longer awaiting review.';
  end if;
  if not candidate.source_present then raise exception 'Removed sub-offers cannot be approved.'; end if;
  if candidate.candidate_role in ('compound-summary', 'catalogue-rate') then
    raise exception 'This candidate role cannot publish a one-off offer.';
  end if;

  select * into raw_item from public.gift_card_raw_items where id = candidate.raw_item_id;
  select * into source_row from public.gift_card_sources where id = candidate.source_id;
  if raw_item.id is null then raise exception 'Stored source item is required.'; end if;
  if source_row.id is null or nullif(btrim(source_row.name), '') is null then
    raise exception 'Stored source identity is required.';
  end if;
  if raw_item.campaign_kind = 'compound' and (
    raw_item.split_review_status <> 'split-complete' or
    candidate.candidate_role <> 'suboffer' or candidate.suboffer_key = 'primary'
  ) then
    raise exception 'Compound campaigns must be split into stable sub-offers before approval.';
  end if;

  mechanic := p_offer->>'promotion_type';
  if mechanic is null or mechanic in ('unknown', 'mixed') then
    raise exception 'A known atomic promotion type is required.';
  end if;
  if nullif(btrim(p_offer->>'brand'), '') is null then raise exception 'Brand is required.'; end if;
  if nullif(btrim(p_offer->>'purchase_location'), '') is null then raise exception 'Seller is required.'; end if;
  if raw_item.canonical_url !~ '^https://' then raise exception 'A source URL is required.'; end if;
  if (p_offer->>'expiry_date') is null and coalesce((p_offer->>'is_ongoing')::boolean, false) = false then
    raise exception 'Expiry is required unless explicitly ongoing.';
  end if;
  if (p_offer->>'expiry_date') is not null and coalesce((p_offer->>'is_ongoing')::boolean, false) then
    raise exception 'An offer cannot be dated and ongoing.';
  end if;
  if mechanic = 'points' and (
    coalesce((p_offer->>'points_multiplier')::numeric, 0) <= 0 or
    nullif(btrim(p_offer->>'points_program'), '') is null
  ) then raise exception 'Points require a multiplier and programme.'; end if;
  if mechanic = 'fixed-dollar-discount' and (
    coalesce((p_offer->>'fixed_discount_dollars')::numeric, 0) <= 0 or
    coalesce((p_offer->>'threshold_dollars')::numeric, 0) <= 0
  ) then raise exception 'Fixed-dollar discounts require a threshold.'; end if;
  if mechanic = 'promo-credit' and (
    coalesce((p_offer->>'promo_credit_dollars')::numeric, 0) <= 0 or
    coalesce((p_offer->>'threshold_dollars')::numeric, 0) <= 0
  ) then raise exception 'Promo credits require a threshold.'; end if;
  if mechanic = 'membership' and not coalesce((p_offer->>'membership_required')::boolean, false) then
    raise exception 'Membership rates must require membership.';
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
    product_id, source_last_seen_at, promo_code, expiry_time, expiry_timezone,
    uses_per_customer, shipping_may_apply, australia_only,
    combinable_with_seller_promotions, terms_url, included_product_ids,
    seller_name, source_id, source_raw_item_id, source_candidate_id,
    source_suboffer_key, reward_destination, fixed_discount_dollars,
    promo_credit_dollars, fee_waiver_dollars, threshold_dollars,
    is_ongoing, targeted
  ) values (
    p_offer_id, p_offer->>'brand', coalesce((p_offer->>'discount_percent')::numeric, 0),
    coalesce(p_offer->>'channel', 'supermarket-promo'), source_row.name,
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_offer->'accepted_at_merchant_ids') x), '{}'),
    p_offer->'points_on_purchase', (p_offer->>'cap_dollars')::numeric,
    (p_offer->>'expiry_date')::date, (p_offer->>'start_date')::date,
    p_offer->>'purchase_location', coalesce(p_offer->>'purchase_method', 'unknown'),
    p_offer->>'limit_per_customer',
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_offer->'accepted_at') x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_offer->'usage_notes') x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_offer->'stack_notes') x), '{}'),
    raw_item.canonical_url, coalesce(p_offer->'citations', '[]'::jsonb),
    coalesce(p_offer->>'confidence', 'needs-verification'), now(), true,
    mechanic, (p_offer->>'bonus_percent')::numeric,
    (p_offer->>'points_multiplier')::numeric, p_offer->>'points_program',
    (p_offer->>'points_value_cents')::numeric,
    coalesce((p_offer->>'membership_required')::boolean, false),
    coalesce((p_offer->>'activation_required')::boolean, false),
    coalesce((p_offer->>'coupon_required')::boolean, false),
    (p_offer->>'min_spend')::numeric, p_offer->>'denomination_note',
    coalesce(p_offer->>'format', 'unknown'), source_row.name,
    nullif(p_offer->>'product_id', ''), now(), nullif(p_offer->>'promo_code', ''),
    nullif(p_offer->>'expiry_time', ''), nullif(p_offer->>'expiry_timezone', ''),
    (p_offer->>'uses_per_customer')::integer,
    coalesce((p_offer->>'shipping_may_apply')::boolean, false),
    (p_offer->>'australia_only')::boolean,
    (p_offer->>'combinable_with_seller_promotions')::boolean,
    nullif(p_offer->>'terms_url', ''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_offer->'included_product_ids') x), '{}'),
    p_offer->>'purchase_location', candidate.source_id, candidate.raw_item_id,
    candidate.id, candidate.suboffer_key, p_offer->>'reward_destination',
    (p_offer->>'fixed_discount_dollars')::numeric,
    (p_offer->>'promo_credit_dollars')::numeric,
    (p_offer->>'fee_waiver_dollars')::numeric,
    (p_offer->>'threshold_dollars')::numeric,
    coalesce((p_offer->>'is_ongoing')::boolean, false),
    coalesce((p_offer->>'targeted')::boolean, false)
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
    confidence = excluded.confidence, last_checked_at = excluded.last_checked_at,
    is_published = true, promotion_type = excluded.promotion_type,
    bonus_percent = excluded.bonus_percent, points_multiplier = excluded.points_multiplier,
    points_program = excluded.points_program, points_value_cents = excluded.points_value_cents,
    membership_required = excluded.membership_required,
    activation_required = excluded.activation_required, coupon_required = excluded.coupon_required,
    min_spend = excluded.min_spend, denomination_note = excluded.denomination_note,
    format = excluded.format, source_name = excluded.source_name,
    product_id = excluded.product_id, source_last_seen_at = excluded.source_last_seen_at,
    promo_code = excluded.promo_code, expiry_time = excluded.expiry_time,
    expiry_timezone = excluded.expiry_timezone, uses_per_customer = excluded.uses_per_customer,
    shipping_may_apply = excluded.shipping_may_apply, australia_only = excluded.australia_only,
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
    is_ongoing = excluded.is_ongoing, targeted = excluded.targeted;

  update public.gift_card_offer_candidates
  set review_status = 'approved', reviewer_email = p_reviewer,
      reviewed_at = now(), approved_offer_id = p_offer_id
  where id = p_candidate_id;

  insert into public.audit_log(actor_email, action, table_name, row_id, diff)
  values (p_reviewer, 'approve-gift-card-candidate', 'gift_card_offer_candidates',
    p_candidate_id, jsonb_build_object(
      'offerId', p_offer_id, 'promotionType', mechanic,
      'rawItemId', candidate.raw_item_id, 'subofferKey', candidate.suboffer_key
    ));
  return p_offer_id;
end;
$$;

revoke all on function public.approve_gift_card_candidate(uuid, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.approve_gift_card_candidate(uuid, text, jsonb, text)
  to service_role;

revoke all on function public.sync_gift_card_candidate_accuracy() from public, anon, authenticated;
revoke all on function public.refresh_gift_card_parent_split_state() from public, anon, authenticated;
