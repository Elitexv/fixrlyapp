-- Two things:
--
-- 1. CRITICAL FIX: notify_on_booking_status_change() still declared its
--    notification target as `uuid`, but bookings.customer_id/provider_id
--    (and notifications.user_id) became `text` Firebase UIDs in the auth
--    swap (20260817050000). PL/pgSQL's assignment coercion accepts a text
--    value into a uuid variable via the type's input function, which only
--    succeeds when the text happens to be UUID-shaped — true for pre-swap
--    accounts (their id retained its original UUID value, just recast to
--    text) but false for any Firebase-native signup (an arbitrary
--    alphanumeric UID). Confirmed live: accepting a booking from a
--    Firebase-native customer currently fails outright —
--    PATCH .../bookings -> 400 {"code":"22P02","message":"invalid input
--    syntax for type uuid: \"<firebase-uid>\""} — which rolls back the
--    whole status-change transaction, not just the notification. This
--    means every accept/reject/on_the_way/complete/cancel involving a
--    post-migration user has been silently failing since the swap.
--
-- 2. Feature: also confirm the booking request to the customer when it's
--    created (previously only the provider was notified on INSERT) — the
--    "your provider is on the way" notification to the customer already
--    existed (20260811092000), it just could never fire successfully for a
--    Firebase-native customer because of bug (1) above.

CREATE OR REPLACE FUNCTION public.notify_on_booking_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user text;
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

-- Extend to also confirm the request to the customer, not just alert the
-- provider.
CREATE OR REPLACE FUNCTION public.notify_provider_on_new_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  customer_name text;
  provider_name text;
  category_name text;
  when_text text;
BEGIN
  SELECT full_name INTO customer_name FROM public.profiles WHERE id = NEW.customer_id;
  SELECT business_name INTO provider_name FROM public.provider_profiles WHERE id = NEW.provider_id;
  SELECT name INTO category_name FROM public.service_categories WHERE id = NEW.category_id;
  when_text := to_char(NEW.scheduled_at, 'FMMonth FMDD, YYYY HH12:MI AM');

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.provider_id,
    'booking_created',
    'New booking request',
    COALESCE(customer_name, 'A customer') || ' booked ' || COALESCE(category_name, 'a service')
      || ' for ' || when_text || '.',
    jsonb_build_object('booking_id', NEW.id)
  );

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.customer_id,
    'booking_requested',
    'Booking request sent',
    'Your ' || COALESCE(category_name, 'service') || ' request to ' || COALESCE(provider_name, 'the provider')
      || ' for ' || when_text || ' has been sent.',
    jsonb_build_object('booking_id', NEW.id)
  );

  RETURN NEW;
END;
$$;
