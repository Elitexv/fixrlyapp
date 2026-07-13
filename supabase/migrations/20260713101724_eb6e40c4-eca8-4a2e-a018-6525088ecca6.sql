
CREATE TABLE public.provider_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, provider_id)
);

GRANT SELECT, INSERT, DELETE ON public.provider_follows TO authenticated;
GRANT ALL ON public.provider_follows TO service_role;

ALTER TABLE public.provider_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can view follows"
  ON public.provider_follows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can follow"
  ON public.provider_follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow themselves"
  ON public.provider_follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

CREATE INDEX idx_provider_follows_provider ON public.provider_follows(provider_id);
CREATE INDEX idx_provider_follows_follower ON public.provider_follows(follower_id);
