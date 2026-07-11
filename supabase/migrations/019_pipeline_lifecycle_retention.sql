-- DealStack AU - complete daily lifecycle cleanup and retention
--
-- Extends the already-live daily pipeline with the cleanup classes identified
-- in the production audit. Every destructive-looking operation is either an
-- archive/state transition or a narrowly fenced retention delete with an audit
-- row. Functions remain service-role only.

alter table public.daily_pipeline_runs
  add column if not exists stale_archived integer not null default 0,
  add column if not exists card_offers_archived integer not null default 0,
  add column if not exists feed_items_retired integer not null default 0,
  add column if not exists feed_items_purged integer not null default 0,
  add column if not exists detection_scanned integer not null default 0,
  add column if not exists detection_detected integer not null default 0,
  add column if not exists detection_inserted integer not null default 0;

-- Existing approved rows predate last_validated_at. Start their validation
-- clock at the last human/source check rather than treating them as epoch-old.
update public.ozbargain_signals
set last_validated_at = coalesce(last_checked_at, updated_at, created_at)
where status = 'approved' and last_validated_at is null;

create index if not exists idx_feed_items_review_fetched
  on public.feed_items (review_state, fetched_at desc);

-- Cron detection inserts do not carry the admin actor request header used by
-- migration 011. Audit them transactionally here so a staged candidate and its
-- system audit record can never diverge.
create or replace function public.audit_system_offer_change_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log(actor_email, action, table_name, row_id, diff)
  values (
    'system@dealstack.local',
    'stage-detection',
    'offer_change_candidates',
    new.id,
    jsonb_build_object(
      'sourceType', new.source_type,
      'contentHash', new.content_hash,
      'hasTarget', new.target_id is not null
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_audit_system_offer_change_insert
  on public.offer_change_candidates;
create trigger trg_audit_system_offer_change_insert
  after insert on public.offer_change_candidates
  for each row execute function public.audit_system_offer_change_insert();

create or replace function public.run_daily_cleanup(
  p_today date,
  p_archived_at timestamptz,
  p_signal_stale_before timestamptz,
  p_feed_stale_before timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed record;
  expired_offers integer := 0;
  expired_signals integer := 0;
  stale_signals integer := 0;
  cards integer := 0;
  retired integer := 0;
  reason text := 'expiry-before-' || p_today::text;
begin
  for changed in
    update public.gift_card_offers set is_published = false
    where is_published = true and expiry_date < p_today returning id
  loop
    expired_offers := expired_offers + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'gift_card_offers', changed.id, jsonb_build_object('reason', reason));
  end loop;

  for changed in
    update public.cashback_offers set is_published = false
    where is_published = true and expiry_date < p_today returning id
  loop
    expired_offers := expired_offers + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'cashback_offers', changed.id, jsonb_build_object('reason', reason));
  end loop;

  for changed in
    update public.points_offers set is_published = false
    where is_published = true and expiry_date < p_today returning id
  loop
    expired_offers := expired_offers + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'points_offers', changed.id, jsonb_build_object('reason', reason));
  end loop;

  for changed in
    update public.weekly_deals set is_published = false
    where is_published = true and expiry_date < p_today returning id
  loop
    expired_offers := expired_offers + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'weekly_deals', changed.id, jsonb_build_object('reason', reason));
  end loop;

  for changed in
    update public.card_offers
    set is_published = false, is_archived = true, archived_at = p_archived_at
    where is_archived = false
      and (expiry_date < p_today or review_by_date < p_today)
    returning id,
      case when expiry_date < p_today then 'expired' else 'review-overdue' end as archive_reason
  loop
    cards := cards + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-card', 'card_offers', changed.id, jsonb_build_object('reason', changed.archive_reason));
  end loop;

  for changed in
    update public.ozbargain_signals
    set status = 'expired', archived_at = p_archived_at,
        archive_reason = reason, last_validated_at = p_archived_at
    where status = 'approved' and expiry_date < p_today returning id
  loop
    expired_signals := expired_signals + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'ozbargain_signals', changed.id, jsonb_build_object('reason', reason));
  end loop;

  for changed in
    update public.ozbargain_signals
    set status = 'expired', archived_at = p_archived_at,
        archive_reason = 'stale-unvalidated'
    where status = 'approved'
      and expiry_date is null
      and coalesce(last_validated_at, last_checked_at, updated_at, created_at)
        < p_signal_stale_before
    returning id
  loop
    stale_signals := stale_signals + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-stale', 'ozbargain_signals', changed.id, jsonb_build_object('reason', 'stale-unvalidated'));
  end loop;

  for changed in
    update public.feed_items
    set review_state = 'ignored', reviewed_at = p_archived_at,
        reviewed_by = 'system@dealstack.local'
    where review_state = 'new' and fetched_at < p_feed_stale_before
    returning id
  loop
    retired := retired + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-retire-stale', 'feed_items', changed.id, jsonb_build_object('reason', 'unreviewed-for-60-days'));
  end loop;

  return jsonb_build_object(
    'expiredOffers', expired_offers,
    'expiredSignals', expired_signals,
    'staleSignals', stale_signals,
    'cardOffers', cards,
    'feedItemsRetired', retired
  );
end;
$$;

create or replace function public.purge_reviewed_feed_items(p_cutoff timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed record;
  total integer := 0;
begin
  for changed in
    delete from public.feed_items
    where review_state in ('ignored', 'rejected')
      and coalesce(reviewed_at, updated_at, fetched_at) < p_cutoff
    returning id, review_state
  loop
    total := total + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values (
      'system@dealstack.local', 'auto-purge-retained', 'feed_items', changed.id,
      jsonb_build_object('previousReviewState', changed.review_state, 'cutoff', p_cutoff)
    );
  end loop;
  return total;
end;
$$;

-- The scheduler uses one wrapper so archival and retention either both commit
-- or both roll back. Calling the two RPCs separately could commit cleanup, fail
-- purge, and then record zero cleanup counters in the run ledger.
create or replace function public.run_daily_pipeline_cleanup(
  p_today date,
  p_archived_at timestamptz,
  p_signal_stale_before timestamptz,
  p_feed_stale_before timestamptz,
  p_purge_before timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  purged integer;
begin
  result := public.run_daily_cleanup(
    p_today,
    p_archived_at,
    p_signal_stale_before,
    p_feed_stale_before
  );
  purged := public.purge_reviewed_feed_items(p_purge_before);
  return result || jsonb_build_object('feedItemsPurged', purged);
end;
$$;

revoke all on function public.run_daily_cleanup(date, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.purge_reviewed_feed_items(timestamptz)
  from public, anon, authenticated;
revoke all on function public.run_daily_pipeline_cleanup(date, timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.run_daily_cleanup(date, timestamptz, timestamptz, timestamptz)
  to service_role;
grant execute on function public.purge_reviewed_feed_items(timestamptz)
  to service_role;
grant execute on function public.run_daily_pipeline_cleanup(date, timestamptz, timestamptz, timestamptz, timestamptz)
  to service_role;
