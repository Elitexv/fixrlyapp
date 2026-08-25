-- invite_staff_member used gen_random_bytes(), which needs the pgcrypto
-- extension — not enabled on this project, confirmed live: every invite
-- attempt failed with "function gen_random_bytes(integer) does not exist".
-- Regenerate the token from two gen_random_uuid() calls instead (already
-- used everywhere else in this schema, no extension dependency, still
-- plenty of entropy — each UUID v4 carries 122 random bits).
CREATE OR REPLACE FUNCTION public.invite_staff_member(_email text, _role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid text := public.uid();
  token text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(uid, 'provider') THEN
    RAISE EXCEPTION 'Only providers can invite staff';
  END IF;
  IF _role NOT IN ('dispatcher', 'technician') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  IF _email IS NULL OR btrim(_email) = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.provider_staff (provider_id, invited_email, role, invite_token, invited_by)
  VALUES (uid, btrim(lower(_email)), _role, token, uid);

  RETURN token;
END;
$$;
