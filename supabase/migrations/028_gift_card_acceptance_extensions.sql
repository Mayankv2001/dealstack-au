-- DealStack AU — gift-card acceptance model extensions (additive)
--
-- NOT APPLIED TO PRODUCTION. Requires explicit user schema review + approval.
-- Apply only AFTER 021–027. This migration adds NO public data, enables NO
-- ingestion, and opens NO gate. It extends the existing (021) product +
-- merchant-acceptance model with reviewed-evidence structure, adds a
-- service-role-only acceptance candidate staging table (RLS default-deny), and
-- an audited security-definer approve RPC mirroring approve_gift_card_candidate.
--
-- Every new column is nullable or defaulted so existing rows stay valid and
-- "unknown" stays unknown. The legacy gift_card_merchant_acceptance.status
-- column (verified/claimed/community) is LEFT UNTOUCHED for backwards
-- compatibility; the richer acceptance_status vocabulary below is the new
-- canonical field. Mapping: verified→confirmed-accepted, claimed→likely-accepted
-- or unofficially-reported (reviewer decides), community→unofficially-reported.
--
-- ── Rollback (destructive; export reviewed data first) ───────────────────────
-- This rollback DROPS all Wave 0 acceptance facts/candidates written after this
-- migration. It is recovery DDL, not a lossless rollback. Export affected rows
-- and resolve public-dedupe conflicts before using it.
--   drop function if exists public.approve_gift_card_acceptance_candidate(uuid, uuid, jsonb, text);
--   drop function if exists public.approve_gift_card_acceptance_removal(uuid, text, text, date);
--   drop table if exists public.gift_card_acceptance_candidates;
--   drop table if exists public.gift_card_acceptance_evidence;
--   drop function if exists public.reject_gift_card_acceptance_evidence_mutation();
--   drop policy if exists "public read published gift_card_merchant_acceptance"
--     on public.gift_card_merchant_acceptance;
--   create policy "public read published gift_card_merchant_acceptance"
--     on public.gift_card_merchant_acceptance for select to anon, authenticated
--     using (is_public = true);
--   drop index if exists public.idx_gc_acceptance_dedupe_store;
--   drop index if exists public.idx_gc_acceptance_dedupe_unresolved;
--   drop index if exists public.idx_gc_acceptance_store;
--   drop index if exists public.idx_gc_acceptance_mcc;
--   drop index if exists public.idx_gc_acceptance_merchant_lower;
--   alter table public.gift_card_merchant_acceptance
--     drop column if exists accepts_online, drop column if exists accepts_in_store,
--     drop column if exists accepts_app, drop column if exists accepts_phone,
--     drop column if exists acceptance_status, drop column if exists evidence_source_type,
--     drop column if exists evidence_publisher,
--     drop column if exists evidence_url, drop column if exists evidence_captured_at,
--     drop column if exists last_checked_at, drop column if exists valid_from,
--     drop column if exists valid_until, drop column if exists limitations,
--     drop column if exists region, drop column if exists participating_location_required,
--     drop column if exists review_state;
--   alter table public.gift_card_products
--     drop column if exists aliases, drop column if exists official_product_page,
--     drop column if exists activation_method, drop column if exists online_available,
--     drop column if exists in_store_available, drop column if exists denominations,
--     drop column if exists activation_delay_note, drop column if exists split_payment,
--     drop column if exists expiry_or_fees_note;
--   alter table public.gift_card_sources
--     drop column if exists acceptance_evidence_source_type;

-- Source provenance is registry-owned. Capture actions read this reviewed tier
-- instead of trusting a browser-supplied value.
alter table public.gift_card_sources
  add column if not exists acceptance_evidence_source_type text
    check (acceptance_evidence_source_type in (
      'issuer-official', 'merchant-official', 'terms',
      'card-network-mcc', 'gcdb', 'specialist', 'community'
    ));

-- ── gift_card_products — product logistics + alias resolution inputs ──────────
alter table public.gift_card_products
  add column if not exists aliases text[] not null default '{}',
  add column if not exists official_product_page text,
  add column if not exists activation_method text,
  add column if not exists online_available boolean,
  add column if not exists in_store_available boolean,
  -- Known face-value denominations; null = unknown (distinct from '{}').
  add column if not exists denominations numeric[],
  add column if not exists activation_delay_note text,
  add column if not exists split_payment text not null default 'unknown'
    check (split_payment in ('supported', 'unsupported', 'partial', 'unknown')),
  add column if not exists expiry_or_fees_note text;

-- ── gift_card_merchant_acceptance — reviewed evidence + channel + freshness ──
-- Tri-state channel booleans: true = accepts, false = does not, null = unknown.
alter table public.gift_card_merchant_acceptance
  add column if not exists accepts_online boolean,
  add column if not exists accepts_in_store boolean,
  add column if not exists accepts_app boolean,
  add column if not exists accepts_phone boolean,
  add column if not exists acceptance_status text not null default 'unknown'
    check (acceptance_status in (
      'confirmed-accepted', 'confirmed-not-accepted', 'likely-accepted',
      'unofficially-reported', 'requires-verification', 'stale', 'unknown'
    )),
  -- Evidence tier (§6 hierarchy). Null = tier not recorded.
  add column if not exists evidence_source_type text
    check (evidence_source_type in (
      'issuer-official', 'merchant-official', 'terms',
      'card-network-mcc', 'gcdb', 'specialist', 'community'
    )),
  add column if not exists evidence_publisher text,
  add column if not exists evidence_url text,
  add column if not exists evidence_captured_at timestamptz,
  -- Canonical freshness stamp (the legacy checked_at column is retained).
  add column if not exists last_checked_at timestamptz,
  add column if not exists valid_from date,
  add column if not exists valid_until date,
  add column if not exists limitations text,
  add column if not exists region text not null default 'AU',
  add column if not exists participating_location_required boolean,
  add column if not exists review_state text;

-- These checks are NOT VALID so legacy rows remain valid, while every new or
-- changed row must carry a usable region and a non-inverted validity range.
alter table public.gift_card_merchant_acceptance
  add constraint gift_card_acceptance_region_not_blank
    check (nullif(btrim(region), '') is not null) not valid,
  add constraint gift_card_acceptance_validity_range
    check (valid_from is null or valid_until is null or valid_from <= valid_until) not valid;

-- A store-resolved fact is identified by product × store × MCC × region. An
-- unresolved fact has no store id, so its normalised merchant identity must be
-- part of the key; omitting it would collapse unrelated merchants into one row.
-- Fail closed with an actionable error rather than letting CREATE INDEX fail
-- after an operator has begun an apply.
do $$
begin
  if exists (
    select 1
    from public.gift_card_merchant_acceptance
    where is_public = true and store_id is not null
    group by product_id, store_id, coalesce(mcc, -1), region
    having count(*) > 1
  ) then
    raise exception 'Resolve duplicate published acceptance rows with a store_id before applying 028.';
  end if;

  if exists (
    select 1
    from public.gift_card_merchant_acceptance
    where is_public = true and store_id is null
    group by product_id, coalesce(mcc, -1),
      coalesce(lower(nullif(btrim(merchant_name), '')), ''),
      coalesce(lower(nullif(btrim(merchant_category), '')), ''), region
    having count(*) > 1
  ) then
    raise exception 'Resolve duplicate published unresolved acceptance rows before applying 028.';
  end if;
end;
$$;

create unique index if not exists idx_gc_acceptance_dedupe_store
  on public.gift_card_merchant_acceptance
    (product_id, store_id, coalesce(mcc, -1), region)
  where is_public = true and store_id is not null;
create unique index if not exists idx_gc_acceptance_dedupe_unresolved
  on public.gift_card_merchant_acceptance
    (product_id, coalesce(mcc, -1),
     coalesce(lower(nullif(btrim(merchant_name), '')), ''),
     coalesce(lower(nullif(btrim(merchant_category), '')), ''), region)
  where is_public = true and store_id is null;
create index if not exists idx_gc_acceptance_store
  on public.gift_card_merchant_acceptance (store_id);
create index if not exists idx_gc_acceptance_mcc
  on public.gift_card_merchant_acceptance (mcc);
create index if not exists idx_gc_acceptance_merchant_lower
  on public.gift_card_merchant_acceptance (lower(merchant_name));

-- After 028, a public row must have crossed the canonical reviewed approval
-- boundary. Legacy rows remain stored but are no longer anonymously readable
-- until an administrator reviews them through the candidate queue.
drop policy if exists "public read published gift_card_merchant_acceptance"
  on public.gift_card_merchant_acceptance;
create policy "public read published gift_card_merchant_acceptance"
  on public.gift_card_merchant_acceptance for select to anon, authenticated
  using (is_public = true and review_state = 'approved');

-- Append-only private evidence ledger. The canonical acceptance row contains
-- the currently reviewed conclusion; this ledger preserves every official,
-- specialist and community evidence revision that supported it.
create table if not exists public.gift_card_acceptance_evidence (
  id                    uuid primary key default gen_random_uuid(),
  acceptance_id         uuid not null references public.gift_card_merchant_acceptance (id) on delete restrict,
  source_id             text references public.gift_card_sources (id) on delete set null,
  evidence_source_type  text not null check (evidence_source_type in (
                            'issuer-official', 'merchant-official', 'terms',
                            'card-network-mcc', 'gcdb', 'specialist', 'community'
                          )),
  evidence_publisher    text,
  evidence_url          text not null check (evidence_url ~ '^https://[^[:space:]]+$'),
  evidence_captured_at  timestamptz not null,
  checked_at            timestamptz not null,
  acceptance_status     text not null check (acceptance_status in (
                            'confirmed-accepted', 'confirmed-not-accepted',
                            'likely-accepted', 'unofficially-reported',
                            'requires-verification', 'stale', 'unknown'
                          )),
  reviewer_email        text not null,
  created_at            timestamptz not null default now()
);
create unique index if not exists idx_gc_acceptance_evidence_identity
  on public.gift_card_acceptance_evidence
    (acceptance_id, evidence_source_type, evidence_url, evidence_captured_at);
create index if not exists idx_gc_acceptance_evidence_acceptance
  on public.gift_card_acceptance_evidence (acceptance_id, evidence_captured_at desc);
alter table public.gift_card_acceptance_evidence enable row level security;
-- No public policy: evidence history is review/audit material. The canonical
-- approved row exposes only the current public-safe attribution.

create or replace function public.reject_gift_card_acceptance_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Gift-card acceptance evidence is append-only.';
end;
$$;
drop trigger if exists trg_gc_acceptance_evidence_immutable
  on public.gift_card_acceptance_evidence;
create trigger trg_gc_acceptance_evidence_immutable
  before update or delete on public.gift_card_acceptance_evidence
  for each row execute function public.reject_gift_card_acceptance_evidence_mutation();
revoke all on function public.reject_gift_card_acceptance_evidence_mutation()
  from public, anon, authenticated;
grant execute on function public.reject_gift_card_acceptance_evidence_mutation()
  to service_role;

-- ── gift_card_acceptance_candidates — service-role-only staging ───────────────
-- Raw merchant names arrive here for alias resolution + admin review. Nothing
-- here is public; the only path to gift_card_merchant_acceptance is the
-- reviewed approve RPC below.
create table if not exists public.gift_card_acceptance_candidates (
  id                    uuid primary key default gen_random_uuid(),
  raw_merchant_name     text not null,
  source_id             text references public.gift_card_sources (id) on delete set null,
  raw_item_id           uuid references public.gift_card_raw_items (id) on delete set null,
  proposed_product_id   text references public.gift_card_products (id) on delete set null,
  resolved_store_id     text references public.stores (id) on delete set null,
  proposed_values       jsonb not null default '{}'::jsonb
                          check (jsonb_typeof(proposed_values) = 'object'),
  resolution_state      text not null default 'unresolved'
                          check (resolution_state in ('resolved', 'unresolved', 'ambiguous')),
  change_kind           text not null default 'new'
                          check (change_kind in ('new', 'changed', 'removed')),
  review_status         text not null default 'new'
                          check (review_status in ('new', 'changed', 'approved', 'rejected')),
  reviewer_email        text,
  reviewed_at           timestamptz,
  linked_acceptance_id  uuid references public.gift_card_merchant_acceptance (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_gc_acceptance_candidates_review
  on public.gift_card_acceptance_candidates (review_status, created_at desc);
create index if not exists idx_gc_acceptance_candidates_product
  on public.gift_card_acceptance_candidates (proposed_product_id);

alter table public.gift_card_acceptance_candidates enable row level security;
-- No policies: staging is service-role only (default-deny), same as
-- gift_card_offer_candidates.
drop trigger if exists trg_gc_acceptance_candidates_updated_at
  on public.gift_card_acceptance_candidates;
create trigger trg_gc_acceptance_candidates_updated_at
  before update on public.gift_card_acceptance_candidates
  for each row execute function public.set_updated_at();

-- ── approve_gift_card_acceptance_candidate — audited publication RPC ──────────
-- Mirrors approve_gift_card_candidate: guard a RESOLVED candidate state →
-- insert a new row or update only a candidate-prelinked row from the
-- ADMIN-REVIEWED jsonb → link the candidate → write the audit row, in one
-- transaction. Never reads the raw name to publish; reviewer values are
-- authoritative. A weaker review can never overwrite stronger public evidence.
create or replace function public.approve_gift_card_acceptance_candidate(
  p_candidate_id uuid,
  p_acceptance_id uuid,
  p_acceptance jsonb,
  p_reviewer text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.gift_card_acceptance_candidates%rowtype;
  existing_acceptance public.gift_card_merchant_acceptance%rowtype;
  v_product_id text;
  v_acceptance_id uuid;
  v_acceptance_status text;
  v_evidence_source_type text;
  v_proposed_evidence_rank integer;
  v_existing_evidence_rank integer;
  v_proposed_status_rank integer;
  v_existing_status_rank integer;
begin
  select * into candidate
  from public.gift_card_acceptance_candidates
  where id = p_candidate_id
  for update;

  if not found then raise exception 'Acceptance candidate not found.'; end if;
  if candidate.review_status = 'approved' and candidate.linked_acceptance_id is not null then
    return candidate.linked_acceptance_id;
  end if;
  if candidate.review_status not in ('new', 'changed') then
    raise exception 'Acceptance candidate is no longer awaiting review.';
  end if;
  if candidate.resolution_state <> 'resolved' then
    raise exception 'Only resolved acceptance candidates may be approved.';
  end if;
  if candidate.change_kind = 'removed' then
    raise exception 'Removed acceptance candidates cannot publish a replacement row.';
  end if;
  if p_acceptance is null or jsonb_typeof(p_acceptance) <> 'object' then
    raise exception 'Reviewed acceptance values must be a JSON object.';
  end if;
  if nullif(btrim(p_reviewer), '') is null then
    raise exception 'A reviewer identity is required.';
  end if;

  v_product_id := coalesce(p_acceptance->>'product_id', candidate.proposed_product_id);
  if nullif(btrim(v_product_id), '') is null then
    raise exception 'A product id is required to publish acceptance.';
  end if;
  if not exists (select 1 from public.gift_card_products where id = v_product_id) then
    raise exception 'Referenced gift-card product does not exist.';
  end if;
  v_acceptance_status := nullif(btrim(p_acceptance->>'acceptance_status'), '');
  if v_acceptance_status is null then
    raise exception 'An acceptance status is required.';
  end if;
  if v_acceptance_status not in (
    'confirmed-accepted', 'confirmed-not-accepted', 'likely-accepted',
    'unofficially-reported', 'requires-verification', 'stale', 'unknown'
  ) then
    raise exception 'Invalid acceptance status.';
  end if;
  v_evidence_source_type := nullif(btrim(p_acceptance->>'evidence_source_type'), '');
  if v_evidence_source_type is null then
    raise exception 'An evidence source type is required.';
  end if;
  if v_evidence_source_type not in (
    'issuer-official', 'merchant-official', 'terms', 'card-network-mcc',
    'gcdb', 'specialist', 'community'
  ) then
    raise exception 'Invalid evidence source type.';
  end if;
  if nullif(btrim(p_acceptance->>'evidence_url'), '') is null
     or (p_acceptance->>'evidence_url') !~ '^https://[^[:space:]]+$' then
    raise exception 'A safe HTTPS evidence URL is required.';
  end if;
  if nullif(btrim(p_acceptance->>'evidence_captured_at'), '') is null then
    raise exception 'An evidence capture time is required.';
  end if;
  perform (p_acceptance->>'evidence_captured_at')::timestamptz;
  if nullif(p_acceptance->>'store_id', '') is null
     and nullif(btrim(p_acceptance->>'merchant_name'), '') is null
     and nullif(btrim(p_acceptance->>'merchant_category'), '') is null
     and nullif(btrim(p_acceptance->>'mcc'), '') is null then
    raise exception 'A store, merchant, category or MCC identity is required.';
  end if;

  -- An update target must be linked to this candidate before approval. This
  -- prevents a caller from supplying an arbitrary UUID and overwriting another
  -- acceptance row through ON CONFLICT (id).
  if p_acceptance_id is not null
     and p_acceptance_id is distinct from candidate.linked_acceptance_id then
    raise exception 'An acceptance update target must be prelinked to the candidate.';
  end if;
  v_acceptance_id := candidate.linked_acceptance_id;
  if v_acceptance_id is null then
    v_acceptance_id := gen_random_uuid();
  else
    select * into existing_acceptance
    from public.gift_card_merchant_acceptance
    where id = v_acceptance_id
    for update;
    if not found then
      raise exception 'The candidate-linked acceptance row does not exist.';
    end if;

    v_proposed_evidence_rank := case v_evidence_source_type
      when 'issuer-official' then 7 when 'merchant-official' then 6
      when 'terms' then 5 when 'card-network-mcc' then 4 when 'gcdb' then 3
      when 'specialist' then 2 when 'community' then 1 else 0 end;
    v_existing_evidence_rank := case existing_acceptance.evidence_source_type
      when 'issuer-official' then 7 when 'merchant-official' then 6
      when 'terms' then 5 when 'card-network-mcc' then 4 when 'gcdb' then 3
      when 'specialist' then 2 when 'community' then 1 else 0 end;
    v_proposed_status_rank := case v_acceptance_status
      when 'confirmed-accepted' then 5 when 'confirmed-not-accepted' then 5
      when 'likely-accepted' then 4 when 'unofficially-reported' then 3
      when 'requires-verification' then 2 when 'stale' then 1 else 0 end;
    v_existing_status_rank := case existing_acceptance.acceptance_status
      when 'confirmed-accepted' then 5 when 'confirmed-not-accepted' then 5
      when 'likely-accepted' then 4 when 'unofficially-reported' then 3
      when 'requires-verification' then 2 when 'stale' then 1 else 0 end;

    if existing_acceptance.is_public and (
      v_proposed_evidence_rank < v_existing_evidence_rank
      or (v_proposed_evidence_rank = v_existing_evidence_rank
          and v_proposed_status_rank < v_existing_status_rank)
      or (v_proposed_evidence_rank = v_existing_evidence_rank
          and v_proposed_status_rank = v_existing_status_rank
          and existing_acceptance.evidence_captured_at is not null
          and (p_acceptance->>'evidence_captured_at')::timestamptz
              < existing_acceptance.evidence_captured_at)
    ) then
      raise exception 'Weaker or older reviewed evidence cannot overwrite a public acceptance row.';
    end if;

    -- Backfill the previous canonical evidence before replacing it. This is
    -- essential for official-supersedes-unofficial: both sources survive.
    if existing_acceptance.evidence_source_type is not null
       and existing_acceptance.evidence_url is not null
       and existing_acceptance.evidence_captured_at is not null then
      insert into public.gift_card_acceptance_evidence (
        acceptance_id, evidence_source_type, evidence_publisher, evidence_url,
        evidence_captured_at, checked_at, acceptance_status, reviewer_email
      ) values (
        existing_acceptance.id,
        existing_acceptance.evidence_source_type,
        existing_acceptance.evidence_publisher,
        existing_acceptance.evidence_url,
        existing_acceptance.evidence_captured_at,
        coalesce(existing_acceptance.last_checked_at,
          existing_acceptance.checked_at, existing_acceptance.evidence_captured_at),
        existing_acceptance.acceptance_status,
        p_reviewer
      ) on conflict do nothing;
    end if;
  end if;

  insert into public.gift_card_merchant_acceptance as a (
    id, product_id, store_id, merchant_name, merchant_category, mcc,
    status, outcome, is_public, source_url, checked_at, notes,
    accepts_online, accepts_in_store, accepts_app, accepts_phone,
    acceptance_status, evidence_source_type, evidence_publisher, evidence_url, evidence_captured_at,
    last_checked_at, valid_from, valid_until, limitations, region,
    participating_location_required, review_state
  ) values (
    v_acceptance_id,
    v_product_id,
    nullif(p_acceptance->>'store_id', ''),
    nullif(p_acceptance->>'merchant_name', ''),
    nullif(p_acceptance->>'merchant_category', ''),
    (p_acceptance->>'mcc')::integer,
    coalesce(p_acceptance->>'status', 'claimed'),
    nullif(p_acceptance->>'outcome', ''),
    coalesce((p_acceptance->>'is_public')::boolean, false),
    nullif(p_acceptance->>'source_url', ''),
    coalesce((p_acceptance->>'checked_at')::timestamptz, now()),
    nullif(p_acceptance->>'notes', ''),
    (p_acceptance->>'accepts_online')::boolean,
    (p_acceptance->>'accepts_in_store')::boolean,
    (p_acceptance->>'accepts_app')::boolean,
    (p_acceptance->>'accepts_phone')::boolean,
    v_acceptance_status,
    v_evidence_source_type,
    nullif(btrim(p_acceptance->>'evidence_publisher'), ''),
    nullif(p_acceptance->>'evidence_url', ''),
    (p_acceptance->>'evidence_captured_at')::timestamptz,
    coalesce((p_acceptance->>'last_checked_at')::timestamptz, now()),
    (p_acceptance->>'valid_from')::date,
    (p_acceptance->>'valid_until')::date,
    nullif(p_acceptance->>'limitations', ''),
    upper(coalesce(nullif(btrim(p_acceptance->>'region'), ''), 'AU')),
    (p_acceptance->>'participating_location_required')::boolean,
    'approved'
  )
  on conflict (id) do update set
    product_id = excluded.product_id, store_id = excluded.store_id,
    merchant_name = excluded.merchant_name, merchant_category = excluded.merchant_category,
    mcc = excluded.mcc, status = excluded.status, outcome = excluded.outcome,
    is_public = excluded.is_public, source_url = excluded.source_url,
    checked_at = excluded.checked_at, notes = excluded.notes,
    accepts_online = excluded.accepts_online, accepts_in_store = excluded.accepts_in_store,
    accepts_app = excluded.accepts_app, accepts_phone = excluded.accepts_phone,
    acceptance_status = excluded.acceptance_status,
    evidence_source_type = excluded.evidence_source_type,
    evidence_publisher = excluded.evidence_publisher,
    evidence_url = excluded.evidence_url, evidence_captured_at = excluded.evidence_captured_at,
    last_checked_at = excluded.last_checked_at, valid_from = excluded.valid_from,
    valid_until = excluded.valid_until, limitations = excluded.limitations,
    region = excluded.region,
    participating_location_required = excluded.participating_location_required,
    review_state = excluded.review_state, updated_at = now()
  returning a.id into v_acceptance_id;

  insert into public.gift_card_acceptance_evidence (
    acceptance_id, source_id, evidence_source_type, evidence_publisher,
    evidence_url, evidence_captured_at, checked_at, acceptance_status,
    reviewer_email
  ) values (
    v_acceptance_id,
    candidate.source_id,
    v_evidence_source_type,
    nullif(btrim(p_acceptance->>'evidence_publisher'), ''),
    p_acceptance->>'evidence_url',
    (p_acceptance->>'evidence_captured_at')::timestamptz,
    coalesce((p_acceptance->>'last_checked_at')::timestamptz,
      (p_acceptance->>'evidence_captured_at')::timestamptz),
    v_acceptance_status,
    p_reviewer
  ) on conflict do nothing;

  update public.gift_card_acceptance_candidates
  set review_status = 'approved', reviewer_email = p_reviewer,
      reviewed_at = now(), linked_acceptance_id = v_acceptance_id, updated_at = now()
  where id = p_candidate_id;

  insert into public.audit_log(actor_email, action, table_name, row_id, diff)
  values (p_reviewer, 'approve-gift-card-acceptance-candidate',
    'gift_card_acceptance_candidates', p_candidate_id::text,
    jsonb_build_object(
      'acceptanceId', v_acceptance_id, 'productId', v_product_id,
      'acceptanceStatus', p_acceptance->>'acceptance_status',
      'evidenceSourceType', p_acceptance->>'evidence_source_type'
    ));
  return v_acceptance_id;
end;
$$;

revoke all on function public.approve_gift_card_acceptance_candidate(uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.approve_gift_card_acceptance_candidate(uuid, uuid, jsonb, text)
  to service_role;

-- A removal closes the existing relationship without deleting or replacing its
-- evidence. It is intentionally a separate reviewed RPC because the normal
-- approval function cannot publish a replacement for a removal candidate.
create or replace function public.approve_gift_card_acceptance_removal(
  p_candidate_id uuid,
  p_reviewer text,
  p_final_status text default 'confirmed-not-accepted',
  p_valid_until date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.gift_card_acceptance_candidates%rowtype;
  v_acceptance_id uuid;
begin
  select * into candidate
  from public.gift_card_acceptance_candidates
  where id = p_candidate_id
  for update;

  if not found then raise exception 'Acceptance candidate not found.'; end if;
  if candidate.review_status = 'approved' and candidate.linked_acceptance_id is not null then
    return candidate.linked_acceptance_id;
  end if;
  if candidate.review_status not in ('new', 'changed')
     or candidate.change_kind <> 'removed' then
    raise exception 'Candidate is not an awaiting removal.';
  end if;
  if candidate.linked_acceptance_id is null then
    raise exception 'A removal candidate must link the existing acceptance row.';
  end if;
  if nullif(btrim(p_reviewer), '') is null then
    raise exception 'A reviewer identity is required.';
  end if;
  if p_final_status not in ('confirmed-not-accepted', 'requires-verification') then
    raise exception 'Removal status must be confirmed-not-accepted or requires-verification.';
  end if;

  update public.gift_card_merchant_acceptance
  set acceptance_status = p_final_status,
      outcome = case when p_final_status = 'confirmed-not-accepted'
        then 'unsuccessful' else outcome end,
      valid_until = coalesce(p_valid_until, current_date),
      review_state = 'approved',
      updated_at = now()
  where id = candidate.linked_acceptance_id
  returning id into v_acceptance_id;
  if v_acceptance_id is null then
    raise exception 'The candidate-linked acceptance row does not exist.';
  end if;

  update public.gift_card_acceptance_candidates
  set review_status = 'approved', reviewer_email = p_reviewer,
      reviewed_at = now(), updated_at = now()
  where id = p_candidate_id;

  insert into public.audit_log(actor_email, action, table_name, row_id, diff)
  values (
    p_reviewer,
    'approve-gift-card-acceptance-removal',
    'gift_card_acceptance_candidates',
    p_candidate_id::text,
    jsonb_build_object(
      'acceptanceId', v_acceptance_id,
      'acceptanceStatus', p_final_status,
      'validUntil', coalesce(p_valid_until, current_date)
    )
  );
  return v_acceptance_id;
end;
$$;

revoke all on function public.approve_gift_card_acceptance_removal(uuid, text, text, date)
  from public, anon, authenticated;
grant execute on function public.approve_gift_card_acceptance_removal(uuid, text, text, date)
  to service_role;
