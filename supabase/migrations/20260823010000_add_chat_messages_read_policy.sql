-- chat_messages has never had an UPDATE RLS policy, so is_read has been
-- dead on arrival since the table was created — any client attempt to mark
-- a message read is silently filtered to 0 rows by RLS (GRANT UPDATE alone
-- isn't enough; a policy is required for the operation to actually match
-- any rows). Needed now to support unread badges/read receipts in the
-- redesigned messages page: a conversation party may mark AS READ any
-- message in their own conversation that they didn't send — never their
-- own messages, and never anything outside a conversation they belong to.
CREATE POLICY "Recipients can mark messages read" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (
    sender_id <> public.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = chat_messages.conversation_id
        AND (public.uid() = c.user_id OR public.uid() = c.provider_id)
    )
  )
  WITH CHECK (
    sender_id <> public.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = chat_messages.conversation_id
        AND (public.uid() = c.user_id OR public.uid() = c.provider_id)
    )
  );
