
-- Allow applicants to delete their own rejected requests so they can re-apply
CREATE POLICY "Users delete own rejected request"
  ON public.provider_requests
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'rejected');

-- Admin helper: toggle a user role from the admin dashboard.
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid, _role app_role, _grant boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;
  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- Never allow removing the last admin
    IF _role = 'admin' AND (SELECT COUNT(*) FROM public.user_roles WHERE role='admin') <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last admin';
    END IF;
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  END IF;
END;
$$;

-- Admin view of every user with aggregated roles (safe — no auth.users columns beyond id/email/created).
CREATE OR REPLACE VIEW public.admin_users_overview
WITH (security_invoker = on) AS
SELECT
  u.id,
  u.email,
  u.created_at,
  p.full_name,
  p.avatar_url,
  p.phone,
  COALESCE(
    (SELECT array_agg(role::text ORDER BY role::text) FROM public.user_roles r WHERE r.user_id = u.id),
    ARRAY[]::text[]
  ) AS roles
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id;

GRANT SELECT ON public.admin_users_overview TO authenticated;

-- Restrict the view to admins only via a wrapper function since views can't have RLS directly
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS SETOF public.admin_users_overview
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can list users';
  END IF;
  RETURN QUERY SELECT * FROM public.admin_users_overview ORDER BY created_at DESC;
END;
$$;
