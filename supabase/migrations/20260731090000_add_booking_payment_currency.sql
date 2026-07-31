ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS payment_currency text;
