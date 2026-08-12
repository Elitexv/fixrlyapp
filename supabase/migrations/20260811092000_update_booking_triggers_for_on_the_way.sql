-- Extend the booking update-rules trigger (see 20260809120000) to cover the
-- new on_the_way status and the provider's live-location pings while en
-- route. Location may only ever move together with the accepted ->
-- on_the_way transition (the initial snapshot) or as a same-status "ping"
-- sent by the assigned provider while already on_the_way — never by the
-- customer, and never alongside any other column change.
CREATE OR REPLACE FUNCTION public.enforce_booking_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  location_changed boolean;
  is_on_the_way_transition boolean;
  is_location_ping boolean;
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
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

  IF location_changed AND auth.uid() IS DISTINCT FROM OLD.provider_id THEN
    RAISE EXCEPTION 'Only the assigned provider can update en-route location';
  END IF;
  IF location_changed AND NOT (is_on_the_way_transition OR is_location_ping) THEN
    RAISE EXCEPTION 'Location can only be set when going on_the_way or while already en route';
  END IF;

  IF is_location_ping THEN
    RETURN NEW; -- status unchanged, just a location ping — nothing else to validate
  END IF;

  IF auth.uid() = OLD.customer_id THEN
    IF NOT (NEW.status = 'cancelled' AND OLD.status IN ('pending', 'accepted', 'on_the_way')) THEN
      RAISE EXCEPTION 'Customers may only cancel a pending, accepted, or en-route booking';
    END IF;
  ELSIF auth.uid() = OLD.provider_id THEN
    IF NOT (
      (NEW.status IN ('accepted', 'rejected') AND OLD.status = 'pending')
      OR is_on_the_way_transition
      OR (NEW.status = 'completed' AND OLD.status IN ('accepted', 'on_the_way'))
    ) THEN
      RAISE EXCEPTION 'Invalid booking status transition for provider';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a party to this booking';
  END IF;

  RETURN NEW;
END;
$$;

-- Extend the customer notification trigger (see 20260730130000) to announce
-- the new on_the_way status too.
CREATE OR REPLACE FUNCTION public.notify_on_booking_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid;
  notif_title text;
  notif_body text;
  category_name text;
  when_text text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT name INTO category_name FROM public.service_categories WHERE id = NEW.category_id;
  when_text := to_char(NEW.scheduled_at, 'FMMonth FMDD, YYYY HH12:MI AM');

  IF NEW.status = 'cancelled' THEN
    target_user := NEW.provider_id;
    notif_title := 'Booking cancelled';
    notif_body := 'The customer cancelled the ' || COALESCE(category_name, 'service') || ' booking for ' || when_text || '.';
  ELSIF NEW.status IN ('accepted', 'on_the_way', 'rejected', 'completed') THEN
    target_user := NEW.customer_id;
    notif_title := CASE NEW.status
      WHEN 'accepted' THEN 'Booking accepted'
      WHEN 'on_the_way' THEN 'Your provider is on the way'
      WHEN 'rejected' THEN 'Booking declined'
      ELSE 'Booking completed'
    END;
    notif_body := CASE NEW.status
      WHEN 'on_the_way' THEN 'Your provider is heading to you now for the ' || COALESCE(category_name, 'service') || ' booking on ' || when_text || '.'
      ELSE 'Your ' || COALESCE(category_name, 'service') || ' booking for ' || when_text || ' was ' || NEW.status || '.'
    END;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (target_user, 'booking_status_' || NEW.status, notif_title, notif_body, jsonb_build_object('booking_id', NEW.id, 'status', NEW.status));

  RETURN NEW;
END;
$$;
