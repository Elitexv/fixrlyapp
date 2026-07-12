
CREATE TYPE public.request_status AS ENUM ('pending','approved','rejected');

CREATE TABLE public.provider_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  bio text,
  phone text,
  hourly_rate numeric,
  availability_note text,
  address text,
  city text,
  zip text,
  latitude double precision,
  longitude double precision,
  service_radius_km integer NOT NULL DEFAULT 25,
  category_ids uuid[] NOT NULL DEFAULT '{}',
  service_id_url text,
  national_id_url text,
  status public.request_status NOT NULL DEFAULT 'pending',
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.provider_requests TO authenticated;
GRANT ALL ON public.provider_requests TO service_role;

ALTER TABLE public.provider_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own request" ON public.provider_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own request" ON public.provider_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own pending request" ON public.provider_requests
  FOR UPDATE TO authenticated USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Admins view all requests" ON public.provider_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update requests" ON public.provider_requests
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_provider_requests_updated_at
  BEFORE UPDATE ON public.provider_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users upload own provider docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'provider-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users read own provider docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'provider-docs' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Users delete own provider docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'provider-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE OR REPLACE FUNCTION public.approve_provider_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.provider_requests%ROWTYPE;
  cid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can approve requests';
  END IF;
  SELECT * INTO r FROM public.provider_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Request is not pending'; END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (r.user_id, 'provider')
    ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.provider_profiles (
    id, business_name, bio, phone, hourly_rate, service_radius_km,
    address, city, zip, availability_note, latitude, longitude, is_active
  ) VALUES (
    r.user_id, r.business_name, r.bio, r.phone, r.hourly_rate, r.service_radius_km,
    r.address, r.city, r.zip, r.availability_note, r.latitude, r.longitude, true
  )
  ON CONFLICT (id) DO UPDATE SET
    business_name = EXCLUDED.business_name,
    bio = EXCLUDED.bio,
    phone = EXCLUDED.phone,
    hourly_rate = EXCLUDED.hourly_rate,
    service_radius_km = EXCLUDED.service_radius_km,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    zip = EXCLUDED.zip,
    availability_note = EXCLUDED.availability_note,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    is_active = true;

  DELETE FROM public.provider_categories WHERE provider_id = r.user_id;
  FOREACH cid IN ARRAY r.category_ids LOOP
    INSERT INTO public.provider_categories (provider_id, category_id) VALUES (r.user_id, cid)
      ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE public.provider_requests
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_provider_request(_request_id uuid, _notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can reject requests';
  END IF;
  UPDATE public.provider_requests
    SET status = 'rejected', review_notes = _notes, reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not pending or not found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_provider_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_provider_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_provider_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_provider_request(uuid, text) TO authenticated;
