
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'none',
  mode TEXT NOT NULL DEFAULT 'sandbox',
  publishable_key TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  platform_fee_percent NUMERIC NOT NULL DEFAULT 10,
  payment_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS publishable_key TEXT;
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC;
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS payment_enabled BOOLEAN;
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE public.admin_settings ALTER COLUMN provider SET DEFAULT 'none';
ALTER TABLE public.admin_settings ALTER COLUMN mode SET DEFAULT 'sandbox';
ALTER TABLE public.admin_settings ALTER COLUMN currency SET DEFAULT 'USD';
ALTER TABLE public.admin_settings ALTER COLUMN platform_fee_percent SET DEFAULT 10;
ALTER TABLE public.admin_settings ALTER COLUMN payment_enabled SET DEFAULT false;
ALTER TABLE public.admin_settings ALTER COLUMN created_at SET DEFAULT now();

GRANT SELECT ON public.admin_settings TO authenticated;
GRANT ALL ON public.admin_settings TO service_role;

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read settings"
  ON public.admin_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert settings"
  ON public.admin_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can update settings"
  ON public.admin_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_admin_settings_updated
  BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.admin_settings (id, provider, mode, currency, platform_fee_percent, payment_enabled)
VALUES ('payments', 'none', 'sandbox', 'USD', 10, false)
ON CONFLICT (id) DO NOTHING;
