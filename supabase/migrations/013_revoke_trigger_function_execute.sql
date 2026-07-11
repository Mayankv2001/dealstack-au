-- DealStack AU — lock down the trigger functions added in 009/011
--
-- Both are SECURITY DEFINER trigger functions. They cannot do anything useful
-- when invoked directly (they return `trigger`), but PostgREST still exposes
-- them at /rest/v1/rpc/* to anon/authenticated, which the Supabase security
-- linter rightly flags (lints 0028/0029). Migrations 010/012 already revoke
-- their RPC functions; this brings the trigger functions in line. Triggers
-- keep firing regardless — trigger execution does not require EXECUTE for the
-- calling role.

revoke all on function public.record_card_offer_history()
  from public, anon, authenticated;

revoke all on function public.audit_admin_mutation()
  from public, anon, authenticated;
