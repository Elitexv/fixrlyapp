import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { fetchNotifications, markNotificationsRead } from "@/lib/notifications";

export function NotificationsBell({ className }: { className?: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: () => fetchNotifications(user!.id),
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["notifications", user.id] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  if (!user) return null;

  const unread = notifications.filter((n) => !n.is_read).length;

  const togglePanel = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await markNotificationsRead(user.id);
      qc.invalidateQueries({ queryKey: ["notifications", user.id] });
    }
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        onClick={togglePanel}
        className="relative size-10 grid place-items-center rounded-full bg-brand/5 border border-brand/10 transition hover:bg-brand/10"
      >
        <Bell className="size-4 text-brand/70" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold grid place-items-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-soft bg-surface shadow-soft overflow-hidden">
            <div className="px-4 py-3 border-b border-brand/5 text-[10px] font-bold uppercase tracking-[0.24em] text-brand/40">
              Notifications
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-brand/50">No notifications yet.</div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className={`px-4 py-3 border-b border-brand/5 last:border-0 ${n.is_read ? "" : "bg-accent/5"}`}>
                    <div className="text-sm font-semibold">{n.title}</div>
                    {n.body && <div className="text-xs text-brand/60 mt-0.5">{n.body}</div>}
                    <div className="text-[10px] text-brand/40 mt-1">{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
