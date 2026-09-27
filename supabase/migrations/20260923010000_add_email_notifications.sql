-- Email notifications, layered onto the existing notifications table the
-- same way push already is: a trigger fires an edge function
-- (supabase/functions/send-email) for a specific subset of notification
-- types, rather than every single one — a booking's "on the way" or a
-- withdrawal being merely requested (admin-facing) don't need an inbox hit.
--
-- Also fills two gaps the notifications system never covered at all:
-- provider application approval/rejection, and new chat messages.

-- ============ email fan-out trigger (parallel to trigger_push_on_new_notification) ============
CREATE OR REPLACE FUNCTION public.trigger_email_on_new_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  webhook_secret text;
  emailable_types text[] := ARRAY[
    'booking_created',
    'booking_status_accepted',
    'booking_status_rejected',
    'booking_status_completed',
    'new_message',
    'provider_approved',
    'provider_rejected',
    'withdrawal_paid',
    'withdrawal_failed',
    'withdrawal_rejected'
  ];
BEGIN
  IF NOT (NEW.type = ANY(emailable_types)) THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO webhook_secret
  FROM vault.decrypted_secrets WHERE name = 'email_webhook_secret';

  IF webhook_secret IS NULL THEN
    RETURN NEW; -- not configured yet — don't block the notification insert
  END IF;

  PERFORM net.http_post(
    url := 'https://wsxjjgeqalnnfquzddpe.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', webhook_secret),
    body := jsonb_build_object('user_id', NEW.user_id, 'type', NEW.type, 'title', NEW.title, 'body', NEW.body, 'data', NEW.data)
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_email_on_new_notification() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_email_on_new_notification ON public.notifications;
CREATE TRIGGER trg_email_on_new_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_email_on_new_notification();

-- ============ provider application approval/rejection notifications ============
-- Neither of these ever notified the applicant before — approving or
-- rejecting a provider_requests row was otherwise invisible outside the
-- app, so an applicant had no way to know except checking back.
CREATE OR REPLACE FUNCTION public.approve_provider_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.provider_requests%ROWTYPE;
  cid uuid;
BEGIN
  IF NOT public.has_role(public.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can approve requests';
  END IF;
  SELECT * INTO r FROM public.provider_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Request is not pending'; END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (r.user_id, 'provider')
    ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.provider_profiles (
    id, business_name, bio, phone, hourly_rate, service_radius_km,
    address, city, zip, availability_note, latitude, longitude, is_active
  ) VALUES (
    r.user_id, r.business_name, r.bio, r.phone, r.hourly_rate, r.service_radius_km,
    r.address, r.city, r.zip, r.availability_note, r.latitude, r.longitude, true
  )
  ON CONFLICT (id) DO UPDATE SET
    business_name = EXCLUDED.business_name,
    bio = EXCLUDED.bio,
    phone = EXCLUDED.phone,
    hourly_rate = EXCLUDED.hourly_rate,
    service_radius_km = EXCLUDED.service_radius_km,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    zip = EXCLUDED.zip,
    availability_note = EXCLUDED.availability_note,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    is_active = true;

  DELETE FROM public.provider_categories WHERE provider_id = r.user_id;
  FOREACH cid IN ARRAY r.category_ids LOOP
    INSERT INTO public.provider_categories (provider_id, category_id) VALUES (r.user_id, cid)
      ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE public.provider_requests
    SET status = 'approved', reviewed_by = public.uid(), reviewed_at = now()
    WHERE id = _request_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (r.user_id, 'provider_approved', 'You''re approved!',
          'Your provider application was approved. Your listing is live on Fixrly.',
          jsonb_build_object('request_id', _request_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_provider_request(_request_id uuid, _notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  applicant_id text;
BEGIN
  IF NOT public.has_role(public.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can reject requests';
  END IF;
  UPDATE public.provider_requests
    SET status = 'rejected', review_notes = _notes, reviewed_by = public.uid(), reviewed_at = now()
    WHERE id = _request_id AND status = 'pending'
    RETURNING user_id INTO applicant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not pending or not found'; END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (applicant_id, 'provider_rejected', 'Application update',
          COALESCE(_notes, 'Your provider application was not approved this time.'),
          jsonb_build_object('request_id', _request_id));
END;
$$;

-- ============ new chat message notifications ============
-- chat_messages/conversations had zero notification wiring before this —
-- neither in-app, push, nor email. Fires once per message toward whichever
-- party didn't send it.
CREATE OR REPLACE FUNCTION public.notify_on_new_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  convo public.conversations%ROWTYPE;
  recipient_id text;
  sender_name text;
  preview text;
BEGIN
  SELECT * INTO convo FROM public.conversations WHERE id = NEW.conversation_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.sender_role = 'provider' THEN
    recipient_id := convo.user_id;
    SELECT business_name INTO sender_name FROM public.provider_profiles WHERE id = NEW.sender_id;
  ELSE
    recipient_id := convo.provider_id;
    SELECT full_name INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
  END IF;

  preview := left(NEW.content, 140);

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    recipient_id,
    'new_message',
    'New message from ' || COALESCE(sender_name, 'Fixrly'),
    preview,
    jsonb_build_object('conversation_id', NEW.conversation_id)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_on_new_chat_message() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_on_new_chat_message ON public.chat_messages;
CREATE TRIGGER trg_notify_on_new_chat_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_chat_message();
