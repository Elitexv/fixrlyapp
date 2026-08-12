-- Live location for the "on the way" map: the provider's current position
-- (pinged periodically while en route) and the booking's destination
-- (geocoded once from the customer's address at booking time), so the
-- customer's map has both a moving pin and a fixed reference point.
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS provider_lat double precision,
ADD COLUMN IF NOT EXISTS provider_lng double precision,
ADD COLUMN IF NOT EXISTS provider_location_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS dest_lat double precision,
ADD COLUMN IF NOT EXISTS dest_lng double precision;

-- The customer's map needs to see the provider's location pings land live,
-- not just on next fetch.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;
