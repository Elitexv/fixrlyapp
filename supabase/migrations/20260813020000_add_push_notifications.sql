-- Web push subscriptions, plus a trigger that fires the send-push edge
-- function whenever a row lands in public.notifications, so in-app
-- notifications also reach the user as a real OS/browser push (app closed
-- or backgrounded included).

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_push_on_new_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  webhook_secret text;
BEGIN
  SELECT decrypted_secret INTO webhook_secret
  FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret';

  IF webhook_secret IS NULL THEN
    RETURN NEW; -- not configured yet — don't block the notification insert
  END IF;

  PERFORM net.http_post(
    url := 'https://wsxjjgeqalnnfquzddpe.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', webhook_secret),
    body := jsonb_build_object('user_id', NEW.user_id, 'title', NEW.title, 'body', NEW.body, 'data', NEW.data)
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_push_on_new_notification() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_push_on_new_notification ON public.notifications;
CREATE TRIGGER trg_push_on_new_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_on_new_notification();
