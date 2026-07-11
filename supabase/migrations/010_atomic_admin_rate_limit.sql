-- DealStack AU — atomic admin rate-limit consumption
--
-- The old count-then-insert sequence admitted concurrent requests that all saw
-- the same count. A transaction-scoped advisory lock serialises one
-- admin/action bucket, then the function counts and inserts in one transaction.

create or replace function public.consume_admin_rate_limit(
  p_admin_email text,
  p_action_key text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
  normalised_email text := lower(trim(p_admin_email));
begin
  if normalised_email = ''
    or p_action_key is null
    or trim(p_action_key) = ''
    or p_max < 1
    or p_window_seconds < 1
  then
    raise exception 'invalid rate-limit arguments';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalised_email || ':' || p_action_key, 0)
  );

  select count(*)::integer
  into recent_count
  from public.admin_rate_limits
  where admin_email = normalised_email
    and action_key = p_action_key
    and created_at >= pg_catalog.clock_timestamp()
      - pg_catalog.make_interval(secs => p_window_seconds);

  if recent_count >= p_max then
    return false;
  end if;

  insert into public.admin_rate_limits (admin_email, action_key)
  values (normalised_email, p_action_key);

  -- Bounded housekeeping runs inside the same transaction and never touches
  -- the active window.
  delete from public.admin_rate_limits
  where created_at < pg_catalog.clock_timestamp() - interval '1 day';

  return true;
end;
$$;

revoke all on function public.consume_admin_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_admin_rate_limit(text, text, integer, integer)
  to service_role;

