-- The owner branch of enforce_booking_update_rules ran its status-transition
-- check unconditionally, so a pure assigned_staff_id change (status
-- unchanged) hit the transition validity check with NEW.status = OLD.status
-- matching none of the three allowed transitions, and got rejected outright
-- — confirmed live: "Invalid booking status transition for provider" when
-- an owner tried to assign a job to staff without also changing its status.
-- Only run the transition check when status actually changes, mirroring
-- how the staff branch already separates the assignment check from the
-- status-transition check.
CREATE OR REPLACE FUNCTION public.enforce_booking_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  location_changed boolean;
  is_on_the_way_transition boolean;
  is_location_ping boolean;
  staff_role text;
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
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (NEW.status IN ('accepted', 'rejected') AND OLD.status = 'pending')
        OR is_on_the_way_transition
        OR (NEW.status = 'completed' AND OLD.status IN ('accepted', 'on_the_way'))
      ) THEN
        RAISE EXCEPTION 'Invalid booking status transition for provider';
      END IF;
    END IF;
  ELSIF public.is_provider_staff(OLD.provider_id) THEN
    SELECT role INTO staff_role FROM public.provider_staff
      WHERE provider_id = OLD.provider_id AND staff_user_id = public.uid() AND status = 'active';

    IF NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id THEN
      IF staff_role <> 'dispatcher' THEN
        RAISE EXCEPTION 'Only a dispatcher can reassign a job';
      END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF staff_role = 'dispatcher' THEN
        IF NOT (
          (NEW.status IN ('accepted', 'rejected') AND OLD.status = 'pending')
          OR is_on_the_way_transition
          OR (NEW.status = 'completed' AND OLD.status IN ('accepted', 'on_the_way'))
        ) THEN
          RAISE EXCEPTION 'Invalid booking status transition';
        END IF;
      ELSE
        IF OLD.assigned_staff_id IS DISTINCT FROM public.uid() THEN
          RAISE EXCEPTION 'You can only update jobs assigned to you';
        END IF;
        IF NOT (is_on_the_way_transition OR (NEW.status = 'completed' AND OLD.status IN ('accepted', 'on_the_way'))) THEN
          RAISE EXCEPTION 'Technicians cannot accept, reject, or cancel a job';
        END IF;
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a party to this booking';
  END IF;

  RETURN NEW;
END;
$$;
