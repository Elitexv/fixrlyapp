-- Records which Paystack mode (test/sandbox vs live) a booking's payment was
-- actually initialized under, so verification later uses the same secret key
-- that created the transaction — even if the admin flips the Mode toggle in
-- between. Test and live are separate Paystack environments; a live secret
-- key can't verify a test-mode reference and vice versa.
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS payment_mode text;
