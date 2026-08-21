-- Phase 2 of the Supabase Auth -> Firebase Auth swap (see the approved plan
-- for full context).
--
-- Firebase's client SDK (createUserWithEmailAndPassword, signInWithPopup)
-- always assigns its own auto-generated UID format — only the Admin SDK can
-- choose a UID, and only at creation time. That ruled out keeping every
-- identity column uuid-typed (verified empirically: auth.uid() throws
-- "invalid input syntax for type uuid" the moment a JWT's sub claim isn't
-- uuid-shaped, which every *new* post-cutover signup's sub will be). So
-- instead: every identity column becomes `text`, and RLS/functions compare
-- against a new public.uid() wrapper (auth.jwt()->>'sub', no uuid cast)
-- instead of Supabase's own auth.uid(). TypeScript's generated types don't
-- need any changes for this — Supabase codegen already represents both
-- uuid and text Postgres columns as plain `string`.
--
-- Also repoints every FK anchored on Supabase's own auth.users(id) at
-- public.profiles(id)/public.provider_profiles(id) instead — auth.users
-- never gets a row for a Firebase-authenticated user — and replaces the
-- auth.users-insert trigger with a callable RPC.
--
-- NOT SAFE TO APPLY ON ITS OWN. This only becomes safe once the paired
-- client (Firebase sign-in) and server (Firebase ID token verification)
-- code from the same release are deployed together. See
-- supabase/rollback-firebase-swap.sql for the paired down-migration.

-- ============ 1. profiles.email, backfilled from auth.users ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
UPDATE public.profiles p SET email = u.email FROM auth.users u WHERE u.id = p.id AND p.email IS NULL;

-- ============ 2. Drop every RLS policy that touches an identity column ============
-- (Recreated in section 6 below using public.uid(). Dropped up front so
-- nothing is left evaluating a stale `auth.uid() = <col>` comparison against
-- a column that's about to change type out from under it.)
DROP POLICY IF EXISTS "Admins can delete admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can insert admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can insert settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can update admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can update settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can view admin settings" ON public.admin_settings;
DROP POLICY IF EXISTS "Booking parties can view" ON public.bookings;
DROP POLICY IF EXISTS "Customers create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Parties update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.chat_messages;
DROP POLICY IF EXISTS "Parties can create their own conversation" ON public.conversations;
DROP POLICY IF EXISTS "Users can update conversations they belong to" ON public.conversations;
DROP POLICY IF EXISTS "Users can view conversations they belong to" ON public.conversations;
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Providers manage own categories" ON public.provider_categories;
DROP POLICY IF EXISTS "Users can follow" ON public.provider_follows;
DROP POLICY IF EXISTS "Users can unfollow themselves" ON public.provider_follows;
DROP POLICY IF EXISTS "Active provider profiles are public" ON public.provider_profiles;
DROP POLICY IF EXISTS "Admins can update any provider" ON public.provider_profiles;
DROP POLICY IF EXISTS "Providers can create own profile" ON public.provider_profiles;
DROP POLICY IF EXISTS "Providers can update own profile" ON public.provider_profiles;
DROP POLICY IF EXISTS "Users can add their own reaction" ON public.provider_reactions;
DROP POLICY IF EXISTS "Users can remove their own reaction" ON public.provider_reactions;
DROP POLICY IF EXISTS "Users can update their own reaction" ON public.provider_reactions;
DROP POLICY IF EXISTS "Admins update requests" ON public.provider_requests;
DROP POLICY IF EXISTS "Admins view all requests" ON public.provider_requests;
DROP POLICY IF EXISTS "Users delete own rejected request" ON public.provider_requests;
DROP POLICY IF EXISTS "Users insert own request" ON public.provider_requests;
DROP POLICY IF EXISTS "Users update own pending request" ON public.provider_requests;
DROP POLICY IF EXISTS "Users view own request" ON public.provider_requests;
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Admins manage reviews" ON public.reviews;
DROP POLICY IF EXISTS "Customers create own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Customers delete own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Customers update own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Admins manage categories" ON public.service_categories;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own provider docs" ON storage.objects;
DROP POLICY IF EXISTS "Users read own provider docs" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own provider docs" ON storage.objects;

-- ============ 3. Drop every FK on an identity column ============
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.provider_profiles DROP CONSTRAINT IF EXISTS provider_profiles_id_fkey;
ALTER TABLE public.admin_settings DROP CONSTRAINT IF EXISTS admin_settings_updated_by_fkey;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_customer_id_fkey;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_customer_id_profiles_fkey;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_provider_id_fkey;
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_provider_id_fkey;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.provider_categories DROP CONSTRAINT IF EXISTS provider_categories_provider_id_fkey;
ALTER TABLE public.provider_follows DROP CONSTRAINT IF EXISTS provider_follows_follower_id_fkey;
ALTER TABLE public.provider_follows DROP CONSTRAINT IF EXISTS provider_follows_provider_id_fkey;
ALTER TABLE public.provider_reactions DROP CONSTRAINT IF EXISTS provider_reactions_user_id_fkey;
ALTER TABLE public.provider_reactions DROP CONSTRAINT IF EXISTS provider_reactions_provider_id_fkey;
ALTER TABLE public.provider_requests DROP CONSTRAINT IF EXISTS provider_requests_user_id_fkey;
ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_fkey;
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_customer_id_fkey;
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_provider_id_fkey;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

-- admin_users_overview (and admin_list_users(), which RETURNS SETOF it) both
-- depend on profiles.id's current type — Postgres won't let a dependent
-- view/rule survive an ALTER COLUMN TYPE underneath it. Dropped here,
-- recreated in sections 10b/11 below (view first, then the function that
-- returns its row type).
DROP FUNCTION IF EXISTS public.admin_list_users();
DROP VIEW IF EXISTS public.admin_users_overview;

-- ============ 4. Convert every identity column from uuid to text ============
ALTER TABLE public.profiles ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.provider_profiles ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.admin_settings ALTER COLUMN updated_by TYPE text USING updated_by::text;
ALTER TABLE public.bookings ALTER COLUMN customer_id TYPE text USING customer_id::text;
ALTER TABLE public.bookings ALTER COLUMN provider_id TYPE text USING provider_id::text;
ALTER TABLE public.chat_messages ALTER COLUMN sender_id TYPE text USING sender_id::text;
ALTER TABLE public.conversations ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.conversations ALTER COLUMN provider_id TYPE text USING provider_id::text;
ALTER TABLE public.notifications ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.provider_categories ALTER COLUMN provider_id TYPE text USING provider_id::text;
ALTER TABLE public.provider_follows ALTER COLUMN follower_id TYPE text USING follower_id::text;
ALTER TABLE public.provider_follows ALTER COLUMN provider_id TYPE text USING provider_id::text;
ALTER TABLE public.provider_reactions ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.provider_reactions ALTER COLUMN provider_id TYPE text USING provider_id::text;
ALTER TABLE public.provider_requests ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.provider_requests ALTER COLUMN reviewed_by TYPE text USING reviewed_by::text;
ALTER TABLE public.push_subscriptions ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.reviews ALTER COLUMN customer_id TYPE text USING customer_id::text;
ALTER TABLE public.reviews ALTER COLUMN provider_id TYPE text USING provider_id::text;
ALTER TABLE public.user_roles ALTER COLUMN user_id TYPE text USING user_id::text;

-- ============ 5. Re-add FKs, repointed at profiles/provider_profiles ============
-- profiles.id and provider_profiles.id are the anchor tables now — no FK to
-- auth.users, populated by ensure_profile (below) instead of the old
-- on-insert trigger.
ALTER TABLE public.admin_settings ADD CONSTRAINT admin_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);
-- bookings.customer_id previously had two redundant FKs (one straight to
-- auth.users, one to profiles added later for PostgREST embed resolution)
-- — collapsed into the one that matters now.
ALTER TABLE public.bookings ADD CONSTRAINT bookings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.provider_categories ADD CONSTRAINT provider_categories_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.provider_follows ADD CONSTRAINT provider_follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.provider_follows ADD CONSTRAINT provider_follows_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.provider_reactions ADD CONSTRAINT provider_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.provider_reactions ADD CONSTRAINT provider_reactions_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.provider_requests ADD CONSTRAINT provider_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
-- provider_requests.reviewed_by never had an FK (nullable, admin-set) — stays that way.
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ============ 6. public.uid() — the auth.uid() replacement ============
-- auth.uid() is Supabase-owned (auth schema) and hardcodes a ::uuid cast on
-- the JWT's sub claim, so it can't be redefined or reused once sub isn't
-- guaranteed uuid-shaped. This mirrors its logic without that cast.
CREATE OR REPLACE FUNCTION public.uid()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '');
$$;

-- ============ 7. has_role(): uuid -> text ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id text, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- ============ 8. Retire the auth.users-insert trigger ============
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ============ 9. ensure_profile RPC replaces handle_new_user's job ============
-- Called by the client immediately after Firebase sign-in/sign-up. Keyed on
-- public.uid() only — never a client-supplied id — preserving the same
-- anti-spoofing guarantee handle_new_user had, including the "clients can't
-- self-grant admin" guard.
--
-- Idempotent and safe on every login, not just the first: profile fields
-- only fill in if still empty (won't clobber a user's own edits with stale
-- Firebase display-name data on re-login), and the default role is only
-- assigned when the user has NO roles yet at all — not just "this role is
-- missing" — so an admin's explicit role removal (admin_set_user_role)
-- doesn't silently get undone on the user's next login.
CREATE OR REPLACE FUNCTION public.ensure_profile(
  p_full_name text,
  p_avatar_url text,
  p_phone text,
  p_role public.app_role,
  p_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid text := public.uid();
  chosen_role public.app_role;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.profiles (id, full_name, avatar_url, phone, email)
  VALUES (uid, p_full_name, p_avatar_url, p_phone, p_email)
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
    email = COALESCE(public.profiles.email, EXCLUDED.email);

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid) THEN
    chosen_role := COALESCE(p_role, 'customer'::public.app_role);
    IF chosen_role = 'admin' THEN chosen_role := 'customer'::public.app_role; END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (uid, chosen_role);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_profile(text, text, text, public.app_role, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_profile(text, text, text, public.app_role, text) TO authenticated;

-- ============ 10. Admin RPCs / trigger: auth.uid() -> public.uid() ============
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id text, _role app_role, _grant boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(public.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;
  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    IF _role = 'admin' AND (SELECT COUNT(*) FROM public.user_roles WHERE role='admin') <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last admin';
    END IF;
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  END IF;
END;
$$;

-- admin_users_overview: read email from profiles instead of auth.users
-- (recreated here, before admin_list_users, since that function's
-- RETURNS SETOF depends on this view's row type existing first).
CREATE OR REPLACE VIEW public.admin_users_overview
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.email,
  p.created_at,
  p.full_name,
  p.avatar_url,
  p.phone,
  COALESCE(
    (SELECT array_agg(role::text ORDER BY role::text) FROM public.user_roles r WHERE r.user_id = p.id),
    ARRAY[]::text[]
  ) AS roles
FROM public.profiles p;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS SETOF public.admin_users_overview
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(public.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can list users';
  END IF;
  RETURN QUERY SELECT * FROM public.admin_users_overview ORDER BY created_at DESC;
END;
$$;

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
  IF NOT public.has_role(public.uid(),'admin') THEN
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
    SET status = 'approved', reviewed_by = public.uid(), reviewed_at = now()
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
  IF NOT public.has_role(public.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can reject requests';
  END IF;
  UPDATE public.provider_requests
    SET status = 'rejected', review_notes = _notes, reviewed_by = public.uid(), reviewed_at = now()
    WHERE id = _request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not pending or not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_booking_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  location_changed boolean;
  is_on_the_way_transition boolean;
  is_location_ping boolean;
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(public.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
    OR NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
    OR NEW.duration_hours IS DISTINCT FROM OLD.duration_hours
    OR NEW.address IS DISTINCT FROM OLD.address
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.total_price IS DISTINCT FROM OLD.total_price
    OR NEW.booking_number IS DISTINCT FROM OLD.booking_number
    OR NEW.payment_provider IS DISTINCT FROM OLD.payment_provider
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
    OR NEW.payment_amount IS DISTINCT FROM OLD.payment_amount
    OR NEW.payment_currency IS DISTINCT FROM OLD.payment_currency
    OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
    OR NEW.dest_lat IS DISTINCT FROM OLD.dest_lat
    OR NEW.dest_lng IS DISTINCT FROM OLD.dest_lng
  THEN
    RAISE EXCEPTION 'Only booking status and en-route location can be changed';
  END IF;

  location_changed :=
    NEW.provider_lat IS DISTINCT FROM OLD.provider_lat
    OR NEW.provider_lng IS DISTINCT FROM OLD.provider_lng
    OR NEW.provider_location_updated_at IS DISTINCT FROM OLD.provider_location_updated_at;

  is_on_the_way_transition := NEW.status = 'on_the_way' AND OLD.status = 'accepted';
  is_location_ping := NEW.status = OLD.status AND OLD.status = 'on_the_way';

  IF location_changed AND public.uid() IS DISTINCT FROM OLD.provider_id THEN
    RAISE EXCEPTION 'Only the assigned provider can update en-route location';
  END IF;
  IF location_changed AND NOT (is_on_the_way_transition OR is_location_ping) THEN
    RAISE EXCEPTION 'Location can only be set when going on_the_way or while already en route';
  END IF;

  IF is_location_ping THEN
    RETURN NEW;
  END IF;

  IF public.uid() = OLD.customer_id THEN
    IF NOT (NEW.status = 'cancelled' AND OLD.status IN ('pending', 'accepted', 'on_the_way')) THEN
      RAISE EXCEPTION 'Customers may only cancel a pending, accepted, or en-route booking';
    END IF;
  ELSIF public.uid() = OLD.provider_id THEN
    IF NOT (
      (NEW.status IN ('accepted', 'rejected') AND OLD.status = 'pending')
      OR is_on_the_way_transition
      OR (NEW.status = 'completed' AND OLD.status IN ('accepted', 'on_the_way'))
    ) THEN
      RAISE EXCEPTION 'Invalid booking status transition for provider';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a party to this booking';
  END IF;

  RETURN NEW;
END;
$$;

-- ============ 12. Recreate every RLS policy with public.uid() ============
CREATE POLICY "Admins can delete admin settings" ON public.admin_settings FOR DELETE TO authenticated USING (public.has_role(public.uid(), 'admin'));
CREATE POLICY "Admins can insert admin settings" ON public.admin_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(public.uid(), 'admin'));
CREATE POLICY "Admins can insert settings" ON public.admin_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(public.uid(), 'admin'));
CREATE POLICY "Admins can update admin settings" ON public.admin_settings FOR UPDATE TO authenticated USING (public.has_role(public.uid(), 'admin')) WITH CHECK (public.has_role(public.uid(), 'admin'));
CREATE POLICY "Admins can update settings" ON public.admin_settings FOR UPDATE TO authenticated USING (public.has_role(public.uid(), 'admin')) WITH CHECK (public.has_role(public.uid(), 'admin'));
CREATE POLICY "Admins can view admin settings" ON public.admin_settings FOR SELECT TO authenticated USING (public.has_role(public.uid(), 'admin'));

CREATE POLICY "Booking parties can view" ON public.bookings FOR SELECT TO authenticated USING (public.uid() = customer_id OR public.uid() = provider_id OR public.has_role(public.uid(), 'admin'));
CREATE POLICY "Customers create bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (public.uid() = customer_id);
CREATE POLICY "Parties update bookings" ON public.bookings FOR UPDATE TO authenticated USING (public.uid() = customer_id OR public.uid() = provider_id OR public.has_role(public.uid(), 'admin'));

CREATE POLICY "Users can send messages in their conversations" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (
  public.uid() = sender_id AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = chat_messages.conversation_id AND (public.uid() = c.user_id OR public.uid() = c.provider_id))
);
CREATE POLICY "Users can view messages in their conversations" ON public.chat_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = chat_messages.conversation_id AND (public.uid() = c.user_id OR public.uid() = c.provider_id))
);

CREATE POLICY "Parties can create their own conversation" ON public.conversations FOR INSERT TO authenticated WITH CHECK (public.uid() = user_id OR public.uid() = provider_id);
CREATE POLICY "Users can update conversations they belong to" ON public.conversations FOR UPDATE TO authenticated USING (public.uid() = user_id OR public.uid() = provider_id) WITH CHECK (public.uid() = user_id OR public.uid() = provider_id);
CREATE POLICY "Users can view conversations they belong to" ON public.conversations FOR SELECT TO authenticated USING (public.uid() = user_id OR public.uid() = provider_id);

CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (public.uid() = user_id) WITH CHECK (public.uid() = user_id);
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated USING (public.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (public.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (public.uid() = id);

CREATE POLICY "Providers manage own categories" ON public.provider_categories FOR ALL TO authenticated USING (public.uid() = provider_id) WITH CHECK (public.uid() = provider_id);

CREATE POLICY "Users can follow" ON public.provider_follows FOR INSERT TO authenticated WITH CHECK (public.uid() = follower_id);
CREATE POLICY "Users can unfollow themselves" ON public.provider_follows FOR DELETE TO authenticated USING (public.uid() = follower_id);

CREATE POLICY "Active provider profiles are public" ON public.provider_profiles FOR SELECT USING (is_active = true OR public.uid() = id OR public.has_role(public.uid(), 'admin'));
CREATE POLICY "Admins can update any provider" ON public.provider_profiles FOR UPDATE TO authenticated USING (public.has_role(public.uid(), 'admin'));
CREATE POLICY "Providers can create own profile" ON public.provider_profiles FOR INSERT TO authenticated WITH CHECK (public.uid() = id AND public.has_role(public.uid(), 'provider'));
CREATE POLICY "Providers can update own profile" ON public.provider_profiles FOR UPDATE TO authenticated USING (public.uid() = id);

CREATE POLICY "Users can add their own reaction" ON public.provider_reactions FOR INSERT TO authenticated WITH CHECK (public.uid() = user_id);
CREATE POLICY "Users can remove their own reaction" ON public.provider_reactions FOR DELETE TO authenticated USING (public.uid() = user_id);
CREATE POLICY "Users can update their own reaction" ON public.provider_reactions FOR UPDATE TO authenticated USING (public.uid() = user_id) WITH CHECK (public.uid() = user_id);

CREATE POLICY "Admins update requests" ON public.provider_requests FOR UPDATE TO authenticated USING (public.has_role(public.uid(), 'admin')) WITH CHECK (public.has_role(public.uid(), 'admin'));
CREATE POLICY "Admins view all requests" ON public.provider_requests FOR SELECT TO authenticated USING (public.has_role(public.uid(), 'admin'));
CREATE POLICY "Users delete own rejected request" ON public.provider_requests FOR DELETE TO authenticated USING (public.uid() = user_id AND status = 'rejected');
CREATE POLICY "Users insert own request" ON public.provider_requests FOR INSERT TO authenticated WITH CHECK (public.uid() = user_id);
CREATE POLICY "Users update own pending request" ON public.provider_requests FOR UPDATE TO authenticated USING (public.uid() = user_id AND status = 'pending') WITH CHECK (public.uid() = user_id AND status = 'pending');
CREATE POLICY "Users view own request" ON public.provider_requests FOR SELECT TO authenticated USING (public.uid() = user_id);

CREATE POLICY "Users manage own push subscriptions" ON public.push_subscriptions FOR ALL TO authenticated USING (public.uid() = user_id) WITH CHECK (public.uid() = user_id);

CREATE POLICY "Admins manage reviews" ON public.reviews FOR ALL TO authenticated USING (public.has_role(public.uid(), 'admin')) WITH CHECK (public.has_role(public.uid(), 'admin'));
CREATE POLICY "Customers create own reviews" ON public.reviews FOR INSERT TO authenticated WITH CHECK (public.uid() = customer_id);
CREATE POLICY "Customers delete own reviews" ON public.reviews FOR DELETE TO authenticated USING (public.uid() = customer_id);
CREATE POLICY "Customers update own reviews" ON public.reviews FOR UPDATE TO authenticated USING (public.uid() = customer_id);

CREATE POLICY "Admins manage categories" ON public.service_categories FOR ALL TO authenticated USING (public.has_role(public.uid(), 'admin')) WITH CHECK (public.has_role(public.uid(), 'admin'));

CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(public.uid(), 'admin')) WITH CHECK (public.has_role(public.uid(), 'admin'));
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(public.uid(), 'admin'));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (public.uid() = user_id);

CREATE POLICY "Users delete own avatar" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND public.uid() = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own provider docs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'provider-docs' AND public.uid() = (storage.foldername(name))[1]);
CREATE POLICY "Users read own provider docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'provider-docs' AND (public.uid() = (storage.foldername(name))[1] OR public.has_role(public.uid(), 'admin')));
CREATE POLICY "Users upload own avatar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND public.uid() = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own provider docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'provider-docs' AND public.uid() = (storage.foldername(name))[1]);
