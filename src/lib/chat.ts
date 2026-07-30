import { supabase } from "@/integrations/supabase/client";

export type ChatConversation = {
  id: string;
  user_id: string;
  provider_id: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  customer_name: string | null;
  provider_name: string | null;
};

export async function getOrCreateConversation(providerId: string, userId: string) {
  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, provider_id: providerId })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function sendChatMessage(conversationId: string, senderId: string, senderRole: "user" | "provider", content: string) {
  const { error } = await supabase.from("chat_messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    sender_role: senderRole,
    content: content.trim(),
  });

  if (error) throw error;

  await supabase
    .from("conversations")
    .update({
      updated_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      last_message_preview: content.trim(),
    })
    .eq("id", conversationId);
}

export async function fetchConversationMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id,conversation_id,sender_id,sender_role,content,created_at,is_read")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchConversationsForUser(userId: string): Promise<ChatConversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id,user_id,provider_id,created_at,updated_at,last_message_at,last_message_preview")
    .or(`user_id.eq.${userId},provider_id.eq.${userId}`)
    .order("last_message_at", { ascending: false });

  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const customerIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const providerIds = Array.from(new Set(rows.map((r) => r.provider_id)));

  const [{ data: customers }, { data: providers }] = await Promise.all([
    supabase.from("profiles").select("id,full_name").in("id", customerIds),
    supabase.from("provider_profiles").select("id,business_name").in("id", providerIds),
  ]);

  const customerMap = new Map((customers ?? []).map((c) => [c.id, c.full_name as string | null]));
  const providerMap = new Map((providers ?? []).map((p) => [p.id, p.business_name as string | null]));

  return rows.map((r) => ({
    ...r,
    customer_name: customerMap.get(r.user_id) ?? null,
    provider_name: providerMap.get(r.provider_id) ?? null,
  }));
}
