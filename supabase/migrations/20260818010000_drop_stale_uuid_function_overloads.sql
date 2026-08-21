-- CREATE OR REPLACE FUNCTION doesn't replace a function whose parameter
-- types changed — it creates a second overload instead. The Firebase-swap
-- migration (20260817050000) changed has_role() and admin_set_user_role()
-- from a uuid _user_id to text, so the original uuid-signature versions
-- were left behind as stale duplicates. PostgREST can't disambiguate which
-- overload to call for an RPC request ("Could not choose the best candidate
-- function"), breaking admin_set_user_role in the admin console. Drop the
-- stale uuid versions; the text versions (already in use everywhere) stay.
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);
DROP FUNCTION IF EXISTS public.admin_set_user_role(uuid, app_role, boolean);
