-- DealStack AU — GCDB gift-card offer predictions (additive, strictly isolated)
--
-- NOT APPLIED TO PRODUCTION. Requires explicit user schema review + approval.
-- Apply only AFTER 021–028. Predictions are an editorial forecast record type,
-- NEVER a live offer. This table:
--   * has RLS enabled with NO policies (service-role only, admin surface),
--   * is never inserted into gift_card_offers,
--   * links to a confirmed offer ONLY via linked_offer_id (the prediction row
--     is never overwritten by a match),
--   * derives a stable fingerprint from normalised seller + sorted/deduplicated
--     families + predicted window and enforces source/fingerprint uniqueness,
--   * rejects changes to the original captured prediction fields while still
--     allowing reviewed outcome fields to change,
--   * carries no confidence score unless GCDB explicitly states one.
-- It also registers the GCDB predictions page as an HTML source with BOTH
-- outbound gates closed (no ingestion is enabled).
--
-- ── Rollback (destructive; export prediction records first) ──────────────────
-- This rollback removes every prediction record and its disabled source row.
-- It is recovery DDL, not a lossless rollback.
--   drop table if exists public.gift_card_offer_predictions;
--   drop function if exists public.reject_gift_card_prediction_fact_mutation();
--   drop function if exists public.gift_card_prediction_fingerprint(text, text[], date, date);
--   drop function if exists public.normalise_gift_card_prediction_identity_text(text);
--   delete from public.gift_card_sources where id = 'gcdb_predictions';

-- This function is deliberately small and locale-independent at the ordering
-- boundary. Keep it byte-for-byte aligned with parsePredictions.ts.
create or replace function public.normalise_gift_card_prediction_identity_text(
  value text
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.lower(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(
        pg_catalog.replace(
          pg_catalog.replace(coalesce(value, ''), pg_catalog.chr(30), ''),
          pg_catalog.chr(31),
          ''
        ),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  );
$$;

create or replace function public.gift_card_prediction_fingerprint(
  seller text,
  families text[],
  starts_at date,
  ends_at date
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.md5(
    public.normalise_gift_card_prediction_identity_text(seller)
    || pg_catalog.chr(31)
    || coalesce((
      select pg_catalog.string_agg(
        normalised.family,
        pg_catalog.chr(30)
        order by pg_catalog.convert_to(normalised.family, 'UTF8')
      )
      from (
        select distinct
          public.normalise_gift_card_prediction_identity_text(family_value.value) as family
        from pg_catalog.unnest(coalesce(families, '{}'::text[]))
          as family_value(value)
      ) as normalised
      where normalised.family <> ''
    ), '')
    || pg_catalog.chr(31)
    || coalesce(starts_at::text, '')
    || pg_catalog.chr(31)
    || coalesce(ends_at::text, '')
  );
$$;

revoke all on function public.normalise_gift_card_prediction_identity_text(text)
  from public, anon, authenticated;
revoke all on function public.gift_card_prediction_fingerprint(text, text[], date, date)
  from public, anon, authenticated;
grant execute on function public.normalise_gift_card_prediction_identity_text(text)
  to service_role;
grant execute on function public.gift_card_prediction_fingerprint(text, text[], date, date)
  to service_role;

create table if not exists public.gift_card_offer_predictions (
  id                     uuid primary key default gen_random_uuid(),
  source_id              text not null references public.gift_card_sources (id) on delete restrict,
  source_url             text not null check (source_url ~ '^https://'),
  source_last_updated    timestamptz,
  -- Predicted identity — every field nullable; unknown stays unknown.
  predicted_seller       text,
  predicted_families     text[] not null default '{}',
  predicted_promotion_text text,
  predicted_promotion_type text,
  predicted_value        text,
  predicted_discount_percent numeric,
  predicted_starts_at    date,
  predicted_ends_at      date,
  source_reference_url   text check (source_reference_url is null or source_reference_url ~ '^https://'),
  -- Preserved verbatim. It has no meaning unless the source publishes a legend.
  source_marker          text,
  fingerprint            text generated always as (
    public.gift_card_prediction_fingerprint(
      predicted_seller,
      predicted_families,
      predicted_starts_at,
      predicted_ends_at
    )
  ) stored not null,
  check (predicted_starts_at is null or predicted_ends_at is null
         or predicted_starts_at <= predicted_ends_at),
  status                 text not null default 'predicted'
                           check (status in (
                             'predicted', 'confirmed', 'historical',
                             'prediction_matched', 'prediction_missed',
                             'prediction_partially_matched'
                           )),
  -- Set only when reconciliation matches a confirmed offer. on delete set null
  -- keeps the prediction record even if the offer is later removed.
  linked_offer_id        text references public.gift_card_offers (id) on delete set null,
  comparison_notes       text,
  reviewed_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint gift_card_offer_predictions_source_fingerprint_key
    unique (source_id, fingerprint)
);

create index if not exists idx_gc_predictions_status
  on public.gift_card_offer_predictions (status, created_at desc);
create index if not exists idx_gc_predictions_linked_offer
  on public.gift_card_offer_predictions (linked_offer_id);

alter table public.gift_card_offer_predictions enable row level security;
-- No policies: predictions are service-role only. They must never reach a
-- public read path or the planner/search/active surfaces.
drop trigger if exists trg_gc_predictions_updated_at
  on public.gift_card_offer_predictions;
create trigger trg_gc_predictions_updated_at
  before update on public.gift_card_offer_predictions
  for each row execute function public.set_updated_at();

create or replace function public.reject_gift_card_prediction_fact_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.source_id is distinct from old.source_id
     or new.source_url is distinct from old.source_url
     or new.source_last_updated is distinct from old.source_last_updated
     or new.predicted_seller is distinct from old.predicted_seller
     or new.predicted_families is distinct from old.predicted_families
     or new.predicted_promotion_text is distinct from old.predicted_promotion_text
     or new.predicted_promotion_type is distinct from old.predicted_promotion_type
     or new.predicted_value is distinct from old.predicted_value
     or new.predicted_discount_percent is distinct from old.predicted_discount_percent
     or new.predicted_starts_at is distinct from old.predicted_starts_at
     or new.predicted_ends_at is distinct from old.predicted_ends_at
     or new.source_reference_url is distinct from old.source_reference_url
     or new.source_marker is distinct from old.source_marker
     or new.created_at is distinct from old.created_at then
    raise exception 'Original gift-card prediction facts are immutable.'
      using errcode = '22000';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_gift_card_prediction_fact_mutation()
  from public, anon, authenticated;
grant execute on function public.reject_gift_card_prediction_fact_mutation()
  to service_role;

drop trigger if exists trg_gc_predictions_immutable_facts
  on public.gift_card_offer_predictions;
create trigger trg_gc_predictions_immutable_facts
  before update on public.gift_card_offer_predictions
  for each row execute function public.reject_gift_card_prediction_fact_mutation();

-- Register the GCDB predictions page as a disabled HTML source. Both gates are
-- closed and the permission stamps are null until a recorded review (TASK-01).
-- A replay may close gates but must not erase a later human review timestamp.
insert into public.gift_card_sources
  (id, name, base_url, feed_url, source_type, enabled,
   automated_fetch_allowed, terms_checked_at, robots_checked_at)
values
  ('gcdb_predictions',
   'GCDB gift-card offer predictions',
   'https://gcdb.com.au',
   'https://gcdb.com.au/predictions/',
   'html', false, false, null, null)
on conflict (id) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  feed_url = excluded.feed_url,
  source_type = excluded.source_type,
  enabled = false,
  automated_fetch_allowed = false;
