-- DealStack AU — transactional audit records for admin mutations
--
-- Admin service-role requests carry x-dealstack-admin-actor. RLS means only
-- service-role writes can reach these tables; the trigger records the actor,
-- action and changed fields in the same transaction as each mutation.

create or replace function public.audit_admin_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  headers jsonb;
  actor text;
  old_row jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  new_row jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  row_key text;
  action_name text;
  changed jsonb;
begin
  begin
    headers := nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := '{}'::jsonb;
  end;
  actor := lower(trim(headers ->> 'x-dealstack-admin-actor'));

  -- Cron jobs and CLI scripts keep their explicit audit path. Only requests
  -- that passed requireAdmin() carry this header.
  if actor is null or actor = '' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  row_key := coalesce(new_row ->> 'id', old_row ->> 'id');
  if tg_op = 'INSERT' then
    action_name := 'create';
    changed := jsonb_build_object('after', new_row - 'updated_at' - 'created_at');
  elsif tg_op = 'DELETE' then
    action_name := 'delete';
    changed := jsonb_build_object('before', old_row - 'updated_at' - 'created_at');
  else
    if old_row -> 'is_archived' is distinct from new_row -> 'is_archived' then
      action_name := case when (new_row ->> 'is_archived')::boolean then 'archive' else 'restore' end;
    elsif old_row -> 'is_published' is distinct from new_row -> 'is_published' then
      action_name := case when (new_row ->> 'is_published')::boolean then 'publish' else 'unpublish' end;
    elsif old_row -> 'is_enabled' is distinct from new_row -> 'is_enabled' then
      action_name := case when (new_row ->> 'is_enabled')::boolean then 'enable' else 'disable' end;
    elsif old_row -> 'hidden_from_homepage' is distinct from new_row -> 'hidden_from_homepage' then
      action_name := case when (new_row ->> 'hidden_from_homepage')::boolean then 'hide-from-homepage' else 'show-on-homepage' end;
    elsif old_row -> 'status' is distinct from new_row -> 'status' then
      action_name := 'status';
    elsif old_row -> 'review_state' is distinct from new_row -> 'review_state' then
      action_name := coalesce(new_row ->> 'review_state', 'update');
    else
      action_name := 'update';
    end if;

    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    into changed
    from (
      select key, jsonb_build_object(
        'before', old_row -> key,
        'after', new_row -> key
      ) as value
      from (
        select jsonb_object_keys(old_row || new_row) as key
      ) keys
      where key not in ('updated_at', 'created_at')
        and old_row -> key is distinct from new_row -> key
    ) differences;
  end if;

  insert into public.audit_log (
    actor_email, action, table_name, row_id, diff
  ) values (
    actor, action_name, tg_table_name, row_key, changed
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'stores',
    'gift_card_offers',
    'cashback_offers',
    'points_offers',
    'ozbargain_signals',
    'weekly_deals',
    'card_offers',
    'feed_sources',
    'feed_items',
    'compliance_reviews',
    'offer_change_candidates'
  ] loop
    execute format('drop trigger if exists trg_transactional_admin_audit on public.%I', table_name);
    execute format(
      'create trigger trg_transactional_admin_audit after insert or update or delete on public.%I for each row execute function public.audit_admin_mutation()',
      table_name
    );
  end loop;
end;
$$;
