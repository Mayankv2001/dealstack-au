-- DealStack AU — pin set_updated_at() search_path (advisor lint 0011)
--
-- Supabase security advisor WARN: function_search_path_mutable on
-- public.set_updated_at (lint 0011). Without a pinned search_path, unqualified
-- identifiers inside the function resolve using the calling role's search
-- path, which is mutable trigger-hijack surface in general.
--
-- '' is safe here: the function body (supabase/migrations/001_initial_schema.sql)
-- is exactly `new.updated_at = now(); return new;` — the only call is now(),
-- which resolves from pg_catalog regardless of search_path. No other schema
-- object is referenced.
--
-- Safely re-runnable: a plain ALTER FUNCTION ... SET just re-sets the same
-- value on repeat application.

alter function public.set_updated_at() set search_path = '';
