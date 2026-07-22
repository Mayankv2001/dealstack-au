-- DealStack AU — align the card-offer public-read bound to Australia/Sydney
--
-- FORWARD-ONLY. Replaces only two public SELECT policies; it approves,
-- publishes, deletes and backfills nothing.
--
-- Why: migration 009 wrote the card_offers read bound with
-- `(now() at time zone 'Australia/Melbourne')::date`, while every other expiry
-- boundary in the system — the read-time filter (lib/offers/expiry.ts todayAU),
-- the daily cleanup RPC (019), the gift-card policy (033) and the four offer
-- policies added by 036 — uses Australia/Sydney with statement_timestamp().
--
-- Melbourne and Sydney share an identical UTC offset and identical DST rules, so
-- this changes NO row's visibility on any date: it is a pure consistency fix
-- that removes the last divergent timezone expression, so a future edit to one
-- policy cannot silently drift from the documented Sydney standard. It also
-- moves from now() (transaction-start) to statement_timestamp() (per-statement),
-- matching 033/036 exactly.
--
-- Semantics are unchanged and remain inclusive: a card offer is live THROUGH the
-- whole of its Sydney expiry day (`expiry_date >= sydney_today`) and disappears
-- at 00:00 the following Sydney day. A NULL expiry stays visible (evergreen);
-- review_by_date keeps its own freshness bound. Service-role callers bypass RLS.

drop policy if exists "public read published card_offers"
  on public.card_offers;
drop policy if exists "public read current published card_offers"
  on public.card_offers;
create policy "public read current published card_offers"
  on public.card_offers for select to anon, authenticated
  using (
    is_published = true
    and is_archived = false
    and confidence = 'confirmed'
    and review_by_date >= (
      pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
    )::date
    and (
      expiry_date is null
      or expiry_date >= (
        pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
      )::date
    )
  );

-- The history mirror must apply the same bound, or an expired offer's change
-- history would outlive the offer itself on the public detail route.
drop policy if exists "public read history for published card offers"
  on public.card_offer_history;
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
        and offer.review_by_date >= (
          pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
        )::date
        and (
          offer.expiry_date is null
          or offer.expiry_date >= (
            pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
          )::date
        )
    )
  );
