-- The "Active provider profiles are public" RLS policy on provider_profiles
-- calls has_role(auth.uid(), 'admin') as part of its boolean condition, but
-- the anon role never had EXECUTE on has_role — Postgres still needs that
-- grant to evaluate the expression even when the is_active=true branch alone
-- would satisfy the policy. Without it, logged-out visitors got a hard 401
-- ("permission denied for function has_role") instead of the public listing.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon;
