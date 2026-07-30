-- Make sure the notifications table actually streams over realtime so the
-- in-app bell updates live instead of only on next fetch.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- Close the loop the other way: notify the customer when a provider
-- accepts/rejects/completes their booking, and notify the provider if the
-- customer cancels.
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
  ELSIF NEW.status IN ('accepted', 'rejected', 'completed') THEN
    target_user := NEW.customer_id;
    notif_title := CASE NEW.status
      WHEN 'accepted' THEN 'Booking accepted'
      WHEN 'rejected' THEN 'Booking declined'
      ELSE 'Booking completed'
    END;
    notif_body := 'Your ' || COALESCE(category_name, 'service') || ' booking for ' || when_text || ' was ' || NEW.status || '.';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (target_user, 'booking_status_' || NEW.status, notif_title, notif_body, jsonb_build_object('booking_id', NEW.id, 'status', NEW.status));

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_on_booking_status_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_on_booking_status_change ON public.bookings;
CREATE TRIGGER trg_notify_on_booking_status_change
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.notify_on_booking_status_change();
