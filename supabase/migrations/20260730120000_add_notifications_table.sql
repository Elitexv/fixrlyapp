CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Guarantees the provider is notified the moment a booking row is created,
-- regardless of whether the client-side email notify call runs or succeeds.
CREATE OR REPLACE FUNCTION public.notify_provider_on_new_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  customer_name text;
  category_name text;
BEGIN
  SELECT full_name INTO customer_name FROM public.profiles WHERE id = NEW.customer_id;
  SELECT name INTO category_name FROM public.service_categories WHERE id = NEW.category_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.provider_id,
    'booking_created',
    'New booking request',
    COALESCE(customer_name, 'A customer') || ' booked ' || COALESCE(category_name, 'a service')
      || ' for ' || to_char(NEW.scheduled_at, 'FMMonth FMDD, YYYY HH12:MI AM'),
    jsonb_build_object('booking_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_provider_on_new_booking() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_provider_on_new_booking ON public.bookings;
CREATE TRIGGER trg_notify_provider_on_new_booking
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_provider_on_new_booking();
