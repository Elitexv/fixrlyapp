CREATE SEQUENCE IF NOT EXISTS public.booking_number_seq;

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS booking_number text;

CREATE OR REPLACE FUNCTION public.set_booking_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.booking_number IS NULL THEN
    NEW.booking_number := 'FXR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.booking_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_booking_number ON public.bookings;
CREATE TRIGGER trg_set_booking_number
BEFORE INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.set_booking_number();

-- Backfill existing rows (kept in original created_at order).
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn, created_at
  FROM public.bookings
  WHERE booking_number IS NULL
)
UPDATE public.bookings b
SET booking_number = 'FXR-' || to_char(o.created_at, 'YYYY') || '-' || lpad(o.rn::text, 6, '0')
FROM ordered o
WHERE b.id = o.id;

-- Keep the sequence ahead of any backfilled numbers so new bookings never collide.
SELECT setval('public.booking_number_seq', GREATEST((SELECT count(*) FROM public.bookings), 1));

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_booking_number_key UNIQUE (booking_number);
