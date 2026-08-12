-- "Users can create conversations for themselves" only allowed the customer
-- (user_id) side to INSERT, so a provider could never start a conversation
-- first — e.g. sending an automated "I'm on my way" message when the
-- customer hasn't messaged yet fails with an RLS violation.
DROP POLICY IF EXISTS "Users can create conversations for themselves" ON public.conversations;
CREATE POLICY "Parties can create their own conversation"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR auth.uid() = provider_id);
