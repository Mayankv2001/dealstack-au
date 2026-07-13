-- DealStack AU — public correction reports for gift-card facts
--
-- NOT APPLIED TO PRODUCTION. Requires explicit schema approval. This extends
-- the existing rate-limited report pattern without changing public records.

create table if not exists public.public_correction_reports (
  id                    uuid primary key default gen_random_uuid(),
  entity_type           text not null
                          check (entity_type in ('gift-card-offer', 'gift-card-acceptance', 'gift-card-product')),
  entity_id             text not null,
  reported_label        text not null,
  reason                text not null
                          check (reason in ('terms', 'expiry', 'acceptance', 'value', 'eligibility', 'other')),
  details               text not null check (char_length(details) between 10 and 2000),
  request_fingerprint   text not null,
  status                text not null default 'new'
                          check (status in ('new', 'reviewed', 'dismissed')),
  reviewed_by           text,
  reviewed_at           timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists idx_public_corrections_queue
  on public.public_correction_reports (status, created_at desc);
create index if not exists idx_public_corrections_rate
  on public.public_correction_reports (request_fingerprint, created_at desc);

alter table public.public_correction_reports enable row level security;
-- No public policies: submission is through the validated security-definer RPC.

create or replace function public.submit_public_correction(
  p_entity_type text,
  p_entity_id text,
  p_reason text,
  p_details text,
  p_request_fingerprint text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
  v_recent integer;
begin
  if p_entity_type not in ('gift-card-offer', 'gift-card-acceptance', 'gift-card-product')
     or p_reason not in ('terms', 'expiry', 'acceptance', 'value', 'eligibility', 'other')
     or char_length(btrim(p_details)) not between 10 and 2000 then
    raise exception 'invalid correction report';
  end if;

  if p_entity_type = 'gift-card-offer' then
    select concat(brand, ' at ', coalesce(purchase_location, source)) into v_label
      from public.gift_card_offers where id = p_entity_id and is_published = true;
  elsif p_entity_type = 'gift-card-acceptance' then
    select coalesce(merchant_name, merchant_category, store_id, 'Acceptance record') into v_label
      from public.gift_card_merchant_acceptance where id::text = p_entity_id and is_public = true;
  else
    select brand into v_label from public.gift_card_products
      where id::text = p_entity_id and is_active = true;
  end if;
  if v_label is null then raise exception 'record is not publicly reportable'; end if;

  select count(*) into v_recent from public.public_correction_reports
    where request_fingerprint = p_request_fingerprint
      and created_at >= now() - interval '24 hours';
  if v_recent >= 5 then return false; end if;

  insert into public.public_correction_reports
    (entity_type, entity_id, reported_label, reason, details, request_fingerprint)
  values
    (p_entity_type, p_entity_id, v_label, p_reason, btrim(p_details), p_request_fingerprint);
  return true;
end;
$$;

revoke all on function public.submit_public_correction(text, text, text, text, text) from public;
grant execute on function public.submit_public_correction(text, text, text, text, text) to anon, authenticated;
