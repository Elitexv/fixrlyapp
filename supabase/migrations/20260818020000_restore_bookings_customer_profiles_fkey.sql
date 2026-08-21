-- The Firebase-swap migration (20260817050000) collapsed bookings.customer_id's
-- two redundant FKs (one to auth.users, one to profiles named
-- bookings_customer_id_profiles_fkey, added in 20260809100000 purely so
-- PostgREST embed hints resolve into profiles) into a single
-- bookings_customer_id_fkey. That broke every client query using the
-- explicit `profiles!bookings_customer_id_profiles_fkey(...)` embed hint —
-- PostgREST resolves embeds by constraint name, and that one no longer
-- existed (confirmed live: bookings list hung on an infinite loading
-- spinner). Postgres allows multiple FK constraints on the same column
-- pointing at the same target, so just add the old name back rather than
-- touching the 4 files that reference it — restores the exact pre-migration
-- redundancy this was always relying on.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_customer_id_profiles_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
