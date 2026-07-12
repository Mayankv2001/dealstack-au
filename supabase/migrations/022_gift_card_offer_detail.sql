-- DealStack AU — gift-card offer detail fields (022, additive)
--
-- Adds the structured terms the public detail page renders (promo code, exact
-- expiry time/timezone, per-customer uses, shipping/geography flags, seller
-- promo combinability, official terms URL, multi-product links) plus
-- unsupported-MCC evidence on products. Everything is nullable/defaulted so
-- existing rows, the demo fallback and the current admin flow keep working
-- unchanged. Candidate-side equivalents live inside the existing
-- gift_card_offer_candidates.terms_json JSONB — no candidate schema change.
--
-- NOT YET APPLIED TO PRODUCTION. The public repo maps every one of these
-- columns defensively (missing column → null), so the detail page degrades
-- honestly until this is applied and types are regenerated (npm run types:gen).
--
-- ── Rollback / recovery ──────────────────────────────────────────────────────
-- Every change is additive and independently reversible; no data in existing
-- columns is touched, so recovery is drop-and-restore, never a data repair:
--   1. Columns:  alter table public.gift_card_offers drop column if exists
--      promo_code, expiry_time, expiry_timezone, uses_per_customer,
--      shipping_may_apply, australia_only, combinable_with_seller_promotions,
--      terms_url, included_product_ids;  and
--      alter table public.gift_card_products drop column if exists unsupported_mccs;
--      (drops any values entered since apply — export first if they matter).
--   2. RPC:      re-run the approve_gift_card_candidate definition from
--      021_gift_card_pipeline.sql (create or replace restores the old body,
--      including its revoke/grant block).
--   3. App code reads all nine columns defensively (`?? null`), so the app
--      keeps working during either direction of the change; regenerate
--      database.types.ts after any rollback.
-- Failure mid-apply is safe to re-run: every statement is idempotent
-- (if not exists / create or replace / on conflict semantics).

-- ── gift_card_offers — structured detail terms ───────────────────────────────
alter table public.gift_card_offers
  -- The literal code entered at checkout (coupon_required says one is needed;
  -- this is the code itself when the source publishes it).
  add column if not exists promo_code text,
  -- Exact end-of-offer time on expiry_date, as HH:MM 24h, with the timezone
  -- label the seller states (e.g. '23:59' + 'AEST'). Both optional.
  add column if not exists expiry_time text
    check (expiry_time is null or expiry_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column if not exists expiry_timezone text,
  -- Stated number of uses per customer (limit_per_customer keeps the prose).
  add column if not exists uses_per_customer integer
    check (uses_per_customer is null or uses_per_customer > 0),
  -- Physical cards may attract a shipping fee.
  add column if not exists shipping_may_apply boolean not null default false,
  -- Geographic eligibility: true = AU only, false = broader, null = unknown.
  add column if not exists australia_only boolean,
  -- Whether this promo can combine with the seller's other promotions:
  -- false = explicitly cannot, true = explicitly can, null = not stated.
  add column if not exists combinable_with_seller_promotions boolean,
  -- The seller/issuer's official terms page for this promotion.
  add column if not exists terms_url text,
  -- All gift-card products included in the promotion (product_id stays as the
  -- primary instrument; multi-card promos list every included product here).
  add column if not exists included_product_ids text[] not null default '{}';

-- ── gift_card_products — negative MCC evidence ───────────────────────────────
-- supported_mccs (021) records where a card is known to work; this records
-- MCCs known NOT to work, so the detail page can show both without guessing.
alter table public.gift_card_products
  add column if not exists unsupported_mccs integer[] not null default '{}';

-- ── approve_gift_card_candidate — carry the new admin-reviewed fields ────────
-- Same contract and guards as 021; only the column list grows. The admin's
-- edited values remain authoritative and nothing auto-publishes.
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
    product_id, source_last_seen_at,
    promo_code, expiry_time, expiry_timezone, uses_per_customer,
    shipping_may_apply, australia_only, combinable_with_seller_promotions,
    terms_url, included_product_ids
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
    now(),
    nullif(p_offer->>'promo_code', ''),
    nullif(p_offer->>'expiry_time', ''),
    nullif(p_offer->>'expiry_timezone', ''),
    (p_offer->>'uses_per_customer')::integer,
    coalesce((p_offer->>'shipping_may_apply')::boolean, false),
    (p_offer->>'australia_only')::boolean,
    (p_offer->>'combinable_with_seller_promotions')::boolean,
    nullif(p_offer->>'terms_url', ''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_offer->'included_product_ids') x), '{}')
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
    source_last_seen_at = excluded.source_last_seen_at,
    promo_code = excluded.promo_code,
    expiry_time = excluded.expiry_time,
    expiry_timezone = excluded.expiry_timezone,
    uses_per_customer = excluded.uses_per_customer,
    shipping_may_apply = excluded.shipping_may_apply,
    australia_only = excluded.australia_only,
    combinable_with_seller_promotions = excluded.combinable_with_seller_promotions,
    terms_url = excluded.terms_url,
    included_product_ids = excluded.included_product_ids;

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
