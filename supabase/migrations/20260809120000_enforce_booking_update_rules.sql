-- "Parties update bookings" (see 20260711162858) allows any customer or
-- provider to UPDATE their own booking row, but has no WITH CHECK — so
-- nothing stops a party from PATCHing columns the app's UI never exposes.
-- Verified directly against the API: an authenticated customer could set
-- payment_status='paid', paid_at=now(), status='completed', and total_price
-- to any value on their own booking, with no payment ever happening.
--
-- This trigger is the one place all four write paths (customer "My
-- bookings", provider dashboard, admin console, and the server-side
-- Paystack functions/webhook) converge, so a booking is only ever recorded
-- through the same validated set of rules regardless of which one wrote it.
CREATE OR REPLACE FUNCTION public.enforce_booking_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Server-side service-role calls (payment init/verify, the Paystack
  -- webhook) and admins are trusted to write any column.
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Every other authenticated party may only change `status`, and only via
  -- a specific, valid transition for their side of the booking.
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
  THEN
    RAISE EXCEPTION 'Only booking status can be changed';
  END IF;

  IF auth.uid() = OLD.customer_id THEN
    IF NOT (NEW.status = 'cancelled' AND OLD.status IN ('pending', 'accepted')) THEN
      RAISE EXCEPTION 'Customers may only cancel a pending or accepted booking';
    END IF;
  ELSIF auth.uid() = OLD.provider_id THEN
    IF NOT (
      (NEW.status IN ('accepted', 'rejected') AND OLD.status = 'pending')
      OR (NEW.status = 'completed' AND OLD.status = 'accepted')
    ) THEN
      RAISE EXCEPTION 'Invalid booking status transition for provider';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a party to this booking';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_update_rules ON public.bookings;
CREATE TRIGGER trg_enforce_booking_update_rules
BEFORE UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_booking_update_rules();
