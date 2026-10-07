import { useEffect, useId, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  Calendar,
  CheckCircle2,
  XCircle,
  Navigation,
  MessageSquare,
  ShieldCheck,
  ShieldX,
  Wallet,
  AlertTriangle,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { fetchNotifications, markNotificationsRead, type AppNotification } from "@/lib/notifications";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

// Per-type icon + color, and where tapping a notification should land —
// same event taxonomy the email pipeline's ctaPathFor uses (see
// supabase/functions/send-email/index.ts), so a notification always leads
// somewhere relevant instead of just sitting there as read-only text.
function notificationVisual(type: string): { icon: typeof Bell; className: string } {
  if (type.startsWith("booking_status_accepted") || type === "booking_status_completed") {
    return { icon: CheckCircle2, className: "bg-green-50 text-green-600" };
  }
  if (type === "booking_status_rejected" || type === "booking_status_cancelled") {
    return { icon: XCircle, className: "bg-red-50 text-red-600" };
  }
  if (type === "booking_status_on_the_way") {
    return { icon: Navigation, className: "bg-orange-50 text-orange-600" };
  }
  if (type === "booking_created" || type === "booking_requested") {
    return { icon: Calendar, className: "bg-blue-50 text-blue-600" };
  }
  if (type === "new_message") {
    return { icon: MessageSquare, className: "bg-purple-50 text-purple-600" };
  }
  if (type === "provider_approved") {
    return { icon: ShieldCheck, className: "bg-green-50 text-green-600" };
  }
  if (type === "provider_rejected") {
    return { icon: ShieldX, className: "bg-red-50 text-red-600" };
  }
  if (type === "withdrawal_paid") {
    return { icon: Wallet, className: "bg-green-50 text-green-600" };
  }
  if (type === "withdrawal_failed" || type === "withdrawal_rejected") {
    return { icon: AlertTriangle, className: "bg-red-50 text-red-600" };
  }
  if (type === "withdrawal_requested") {
    return { icon: Wallet, className: "bg-amber-50 text-amber-600" };
  }
  return { icon: Bell, className: "bg-brand/5 text-brand/60" };
}

function notificationPath(n: AppNotification): string | null {
  if (n.type.startsWith("booking_")) return "/bookings";
  if (n.type === "new_message") return "/messages";
  if (n.type === "provider_approved") return "/dashboard";
  if (n.type === "provider_rejected") return "/profile";
  if (n.type.startsWith("withdrawal_")) return "/payouts";
  return null;
}

export function NotificationsBell({ className }: { className?: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // A page can render more than one bell (e.g. the dashboard's mobile
  // header plus the desktop top bar, one hidden by CSS). Supabase reuses a
  // channel by name, so two bells sharing `notifications:<user>` would try
  // to add a listener to an already-subscribed channel and throw — give each
  // instance its own channel name.
  const instanceId = useId();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: () => fetchNotifications(user!.id),
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}:${instanceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["notifications", user.id] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc, instanceId]);

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

  const openNotification = (n: AppNotification) => {
    setOpen(false);
    const path = notificationPath(n);
    if (path) navigate({ to: path });
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={togglePanel}
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          "relative size-10 grid place-items-center rounded-full border transition",
          unread > 0
            ? "border-accent/20 bg-accent/10 text-accent hover:bg-accent/15"
            : "border-brand/10 bg-brand/5 text-brand/70 hover:bg-brand/10",
        )}
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold grid place-items-center border-2 border-white dark:border-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Notifications"
            className="light-surface absolute right-0 top-12 z-30 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border border-soft bg-white shadow-soft"
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-brand/5">
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand/40">Notifications</span>
              {notifications.length > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand/30">{notifications.length}</span>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <span className="grid size-10 place-items-center rounded-2xl bg-brand/5 text-brand/25">
                    <BellOff className="size-4" />
                  </span>
                  <p className="text-sm text-brand/50">You're all caught up.</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const { icon: Icon, className: iconClass } = notificationVisual(n.type);
                  const clickable = !!notificationPath(n);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => clickable && openNotification(n)}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-brand/5 px-4 py-3 text-left transition last:border-0",
                        clickable ? "hover:bg-brand/5" : "cursor-default",
                        !n.is_read && "bg-accent/5",
                      )}
                    >
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", iconClass)}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-brand">{n.title}</span>
                          {!n.is_read && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                        </span>
                        {n.body && <span className="mt-0.5 block truncate text-xs text-brand/60">{n.body}</span>}
                        <span className="mt-1 block text-[10px] font-medium text-brand/35">{formatRelativeTime(n.created_at)}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
