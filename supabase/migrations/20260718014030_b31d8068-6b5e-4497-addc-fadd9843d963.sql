
-- Allow public read of the 'map' settings row so the GoogleMap loader can pick up the admin-provided key
GRANT SELECT ON public.admin_settings TO anon;
CREATE POLICY "Public can read map settings"
  ON public.admin_settings FOR SELECT TO anon
  USING (id = 'map');

INSERT INTO public.admin_settings (id, provider, mode, currency, platform_fee_percent, payment_enabled)
VALUES ('map', 'none', 'sandbox', 'NGN', 0, false)
ON CONFLICT (id) DO NOTHING;

-- Reactions (like / dislike) for provider profiles
CREATE TABLE public.provider_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('like','dislike')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, user_id)
);

GRANT SELECT ON public.provider_reactions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_reactions TO authenticated;
GRANT ALL ON public.provider_reactions TO service_role;

ALTER TABLE public.provider_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reactions"
  ON public.provider_reactions FOR SELECT
  USING (true);

CREATE POLICY "Users can add their own reaction"
  ON public.provider_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reaction"
  ON public.provider_reactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own reaction"
  ON public.provider_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_provider_reactions_updated
  BEFORE UPDATE ON public.provider_reactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
