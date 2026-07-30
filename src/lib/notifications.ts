import { supabase } from "@/integrations/supabase/client";

export type AppNotification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
};

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id,user_id,type,title,body,data,is_read,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function markNotificationsRead(userId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
}
