CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  last_message_preview text,
  UNIQUE (user_id, provider_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('user','provider')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.chat_messages TO service_role;

CREATE POLICY "Users can view conversations they belong to"
  ON public.conversations FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = provider_id);

CREATE POLICY "Users can create conversations for themselves"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update conversations they belong to"
  ON public.conversations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = provider_id)
  WITH CHECK (auth.uid() = user_id OR auth.uid() = provider_id);

CREATE POLICY "Users can view messages in their conversations"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = conversation_id
        AND (auth.uid() = c.user_id OR auth.uid() = c.provider_id)
    )
  );

CREATE POLICY "Users can send messages in their conversations"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = conversation_id
        AND (auth.uid() = c.user_id OR auth.uid() = c.provider_id)
    )
  );
