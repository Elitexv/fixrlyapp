-- New lifecycle state between "accepted" and "completed": the provider is
-- physically en route. Split into its own migration file (transaction)
-- because a newly added enum value can't be referenced by other statements
-- in the same transaction that added it.
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'on_the_way' AFTER 'accepted';
