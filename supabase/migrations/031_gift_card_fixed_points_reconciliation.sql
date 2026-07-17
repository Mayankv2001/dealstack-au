-- DealStack AU — reconcile the gift-card fixed_points drift (additive, forward-only)
--
-- APPLIED TO PRODUCTION 2026-07-17 as ledger version 031.
--
-- WHY THIS MIGRATION EXISTS
-- Migration 023 was applied to production in its pre-2026-07-14 form. The 023
-- FILE was later edited (commit 84ac591) to add the `fixed_points` mechanic to
-- gift_card_offers and gift_card_offer_candidates, its two accuracy value
-- checks, the public accuracy check, the sync trigger, and the approve RPC.
-- That edit never reached production, because 023 was already recorded as
-- applied. Read-only production probes (2026-07-15) confirmed the exact drift:
--   * gift_card_offers.fixed_points            — MISSING (all 12 other 023 cols present)
--   * gift_card_offer_candidates.fixed_points  — MISSING (all 12 other 023 cols present)
--   * gift_card_offer_occurrences.fixed_points — MISSING (025 was applied
--                                                before its local file edit)
--   * approve_gift_card_candidate              — no fixed_points mapping
--   * gift_card_candidates_accuracy_values_check / _offers_accuracy_values_check
--                                              — no `fixed_points > 0` clause
--   * gift_card_offers_public_accuracy_check (NOT VALID) — points branch still
--       requires points_multiplier > 0, so a fixed-points-only offer (e.g. the
--       Point Hacks "2,000 bonus points" weekly offers) cannot be published.
--
-- The 023 file is intentionally LEFT UNCHANGED as the documentary record of the
-- intended accuracy model. Production is reconciled with this forward migration,
-- never by rewriting or re-running 023. On a fresh replay 023 creates
-- fixed_points and this migration is an idempotent no-op; in production 023 did
-- not create it and this migration adds it. Both lineages converge on the same
-- end state — the constraint, trigger and RPC bodies below are byte-identical to
-- the current 023 file.
--
-- SAFETY
--   * Additive: adds one nullable numeric column to each affected table; no data backfill,
--     no invented point values, existing rows keep fixed_points = NULL.
--   * Value-check constraints are dropped-if-exists then re-added so a re-run is
--     idempotent; re-validation passes because every existing row has
--     fixed_points = NULL (the new clause is `fixed_points is null or > 0`).
--   * The public accuracy check stays NOT VALID: legacy published rows are not
--     retro-validated; only newly published/updated rows must satisfy it.
--   * The RPC keeps SECURITY DEFINER, set search_path = '', fully-qualified
--     objects, transactional guard→upsert→link→audit, and service_role-only
--     execution. Field mapping is preserved exactly and extended with
--     fixed_points.
--
-- APPLY ORDER: this migration is independent of 027/028/029/030 (it touches only
-- the offer/candidate accuracy schema). Apply it FIRST to close the only ACTIVE
-- app⇄prod mismatch, then 027 → 028 → 029 → 030. See
-- docs/gift-card-migration-031-fixed-points.md.
--
-- ── Rollback (safe; the column is additive and newly all-NULL) ────────────────
-- Only run before any fixed-points offer is published. This restores the
-- pre-031 production form (value checks and public check without fixed_points,
-- RPC/trigger without fixed_points). Re-declare the pre-edit bodies from the
-- production dumps in docs/gift-card-migration-031-fixed-points.md, then:
--   alter table public.gift_card_offers          drop column if exists fixed_points;
--   alter table public.gift_card_offer_candidates drop column if exists fixed_points;
--   alter table public.gift_card_offer_occurrences drop column if exists fixed_points;
-- (Dropping the column cascades to the re-added check clauses referencing it.)

-- ── 1. Columns ───────────────────────────────────────────────────────────────
alter table public.gift_card_offer_candidates
  add column if not exists fixed_points numeric;

alter table public.gift_card_offers
  add column if not exists fixed_points numeric;

alter table public.gift_card_offer_occurrences
  add column if not exists fixed_points numeric;

-- Production's applied 025 mechanic check predates fixed_points. Drop the
-- generated-name CASE constraint by its definition, then install one stable
-- named constraint. On a clean replay this also replaces 025's equivalent
-- anonymous check, keeping both lineages identical and retry-safe.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_def.oid, constraint_def.conname
    from pg_catalog.pg_constraint constraint_def
    where constraint_def.conrelid =
      'public.gift_card_offer_occurrences'::pg_catalog.regclass
      and constraint_def.contype = 'c'
      and pg_catalog.pg_get_constraintdef(constraint_def.oid) ilike
        '%promotion_type%'
      and pg_catalog.pg_get_constraintdef(constraint_def.oid) ilike
        '%points_multiplier%'
  loop
    execute pg_catalog.format(
      'alter table public.gift_card_offer_occurrences drop constraint %I',
      constraint_row.conname
    );
  end loop;
end;
$$;

alter table public.gift_card_offer_occurrences
  drop constraint if exists gift_card_offer_occurrences_fixed_points_check;
alter table public.gift_card_offer_occurrences
  add constraint gift_card_offer_occurrences_fixed_points_check
  check (fixed_points is null or fixed_points > 0);

alter table public.gift_card_offer_occurrences
  drop constraint if exists gift_card_offer_occurrences_mechanic_check;
alter table public.gift_card_offer_occurrences
  add constraint gift_card_offer_occurrences_mechanic_check check (
    case promotion_type
      when 'discount' then discount_percent > 0
      when 'fixed-dollar-discount' then fixed_dollars > 0 and threshold_dollars > 0
      when 'bonus-value' then bonus_percent > 0
      when 'points' then
        (coalesce(points_multiplier, 0) > 0 or coalesce(fixed_points, 0) > 0)
        and not (
          coalesce(points_multiplier, 0) > 0
          and coalesce(fixed_points, 0) > 0
        )
        and nullif(pg_catalog.btrim(points_programme), '') is not null
      when 'promo-credit' then fixed_dollars > 0 and threshold_dollars > 0
      when 'fee-waiver' then fixed_dollars is null or fixed_dollars >= 0
      when 'membership' then discount_percent > 0
      else false
    end
  );

-- ── 2. Accuracy value checks — add the `fixed_points > 0` rule ────────────────
alter table public.gift_card_offer_candidates
  drop constraint if exists gift_card_candidates_accuracy_values_check;
alter table public.gift_card_offer_candidates
  add constraint gift_card_candidates_accuracy_values_check check (
    (fixed_discount_dollars is null or fixed_discount_dollars > 0) and
    (fixed_points is null or fixed_points > 0) and
    (promo_credit_dollars is null or promo_credit_dollars > 0) and
    (fee_waiver_dollars is null or fee_waiver_dollars > 0) and
    (threshold_dollars is null or threshold_dollars > 0) and
    not (is_ongoing and expires_at is not null) and
    (source_present or source_removed_at is not null)
  );

alter table public.gift_card_offers
  drop constraint if exists gift_card_offers_accuracy_values_check;
alter table public.gift_card_offers
  add constraint gift_card_offers_accuracy_values_check check (
    (fixed_discount_dollars is null or fixed_discount_dollars > 0) and
    (fixed_points is null or fixed_points > 0) and
    (promo_credit_dollars is null or promo_credit_dollars > 0) and
    (fee_waiver_dollars is null or fee_waiver_dollars > 0) and
    (threshold_dollars is null or threshold_dollars > 0) and
    not (is_ongoing and expiry_date is not null)
  );

-- ── 3. Public accuracy check — points branch accepts fixed_points ─────────────
-- Kept NOT VALID: legacy published rows are not retro-validated; every newly
-- published/updated row must satisfy the fixed-points-aware points rule
-- (exactly one of points_multiplier or fixed_points).
alter table public.gift_card_offers
  drop constraint if exists gift_card_offers_public_accuracy_check;
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
        when 'points' then (coalesce(points_multiplier, 0) > 0 or coalesce(fixed_points, 0) > 0)
          and not (coalesce(points_multiplier, 0) > 0 and coalesce(fixed_points, 0) > 0)
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

-- ── 4. Candidate accuracy sync trigger — sync + fingerprint fixed_points ──────
-- Byte-identical to the current 023 body; the only production delta is the
-- fixed_points sync line and the 'fixedPoints' fingerprint key.
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
  new.fixed_points := coalesce((new.terms_json->>'fixedPoints')::numeric, new.fixed_points);
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
    'fixedPoints', new.fixed_points,
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

revoke all on function public.sync_gift_card_candidate_accuracy() from public, anon, authenticated;

-- ── 5. Approval RPC — insert/update/validate fixed_points ─────────────────────
-- Byte-identical to the current 023 body: fail-closed guards, transactional
-- guard→upsert→link→audit, SECURITY DEFINER, search_path = '', fully qualified.
-- The only production delta is fixed_points in the points validation, the INSERT
-- column list, the VALUES list, and the ON CONFLICT update set.
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
    (coalesce((p_offer->>'points_multiplier')::numeric, 0) <= 0 and
      coalesce((p_offer->>'fixed_points')::numeric, 0) <= 0) or
    (coalesce((p_offer->>'points_multiplier')::numeric, 0) > 0 and
      coalesce((p_offer->>'fixed_points')::numeric, 0) > 0) or
    nullif(btrim(p_offer->>'points_program'), '') is null
  ) then raise exception 'Points require exactly one of multiplier or fixed points, plus a programme.'; end if;
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
    promotion_type, bonus_percent, points_multiplier, fixed_points, points_program,
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
    (p_offer->>'points_multiplier')::numeric,
    (p_offer->>'fixed_points')::numeric, p_offer->>'points_program',
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
    fixed_points = excluded.fixed_points,
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
