-- bookings.customer_id already has an FK to auth.users(id) (named
-- bookings_customer_id_fkey), but the app embeds the customer's profile via
-- PostgREST hint "profiles!bookings_customer_id_fkey" in several places
-- (bookings list, admin, dashboard, receipt). PostgREST resolves that hint by
-- constraint name, and a constraint pointing at auth.users can't satisfy an
-- embed into public.profiles, so those queries fail with PGRST200 and no
-- bookings ever render. Add a second FK, scoped to public.profiles, so the
-- embed hint has a real relationship to resolve.
ALTER TABLE public.bookings
ADD CONSTRAINT bookings_customer_id_profiles_fkey
FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
