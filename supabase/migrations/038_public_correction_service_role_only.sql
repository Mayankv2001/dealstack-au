-- DealStack AU — restrict submit_public_correction to the service role
--
-- Migration 026 shipped this security-definer function with
--   grant execute ... to anon, authenticated;
-- which is NOT the grant model every other public-submission RPC uses.
-- Migration 012 (submit_card_offer_correction) is the correct precedent:
-- revoke from public/anon/authenticated, grant to service_role only.
--
-- Why this matters: `anon` is the publishable key that ships in the browser
-- bundle, so any visitor could call the RPC directly with supabase-js and
-- skip /api/reports/[entityType]/[id] entirely. The function's own throttle
-- counts rows matching `p_request_fingerprint`, but that fingerprint is a
-- CALLER-SUPPLIED argument — a direct caller passes a fresh value per call
-- and the 5-per-24h cap never fires. Routing every submission through the
-- service-role API route makes the server the sole author of the
-- fingerprint, which is what the rate limit assumes.
--
-- Verified before writing: production ACL on submit_public_correction was
-- `postgres=X, anon=X, authenticated=X, service_role=X`, against
-- `postgres=X, service_role=X` for submit_card_offer_correction.
-- public_correction_reports held 0 rows, so nothing has exploited this.
--
-- No table, column, RLS policy or function body changes — grants only.

revoke all on function public.submit_public_correction(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_public_correction(text, text, text, text, text)
  to service_role;
