ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_required',
ADD COLUMN IF NOT EXISTS payment_reference text,
ADD COLUMN IF NOT EXISTS payment_amount numeric(10,2),
ADD COLUMN IF NOT EXISTS paid_at timestamptz;
