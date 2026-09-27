import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarCheck, User, LayoutDashboard, MessageSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSession, useRoles, useMyBusiness } from "@/lib/session";
import { fetchTotalUnreadCount } from "@/lib/chat";

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useSession();
  const { data: roles = [] } = useRoles(user);
  const { data: business } = useMyBusiness(user, roles);
  const isProvider = roles.includes("provider") || !!business;

  const { data: unreadMessages = 0 } = useQuery({
    queryKey: ["unread-messages-total", user?.id],
    enabled: !!user,
    queryFn: () => fetchTotalUnreadCount(user!.id),
    refetchInterval: 30_000,
  });

  const items = [
    { to: "/", label: "Home", icon: Home },
    { to: "/bookings", label: "Bookings", icon: CalendarCheck },
    { to: "/messages", label: "Messages", icon: MessageSquare, badge: unreadMessages },
    ...(isProvider ? [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] : []),
    { to: "/profile", label: "Profile", icon: User },
  ] as const;

  return (
    <nav
      className="light-surface fixed inset-x-4 z-40 mx-auto max-w-lg rounded-[28px] border border-black/5 bg-white/95 p-1.5 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-black/95 dark:shadow-black/50"
      style={{ bottom: "max(env(safe-area-inset-bottom), 1rem)" }}
    >
      <div className="flex items-center justify-between gap-1">
        {items.map(({ to, label, icon: Icon, badge }: any) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-1 flex-col items-center gap-0.5 rounded-[22px] py-2 transition-all duration-200 active:scale-90"
            >
              <span
                className={`relative grid place-items-center rounded-2xl px-4 py-1.5 transition-all duration-200 ${
                  active ? "bg-accent shadow-lg shadow-accent/30" : ""
                }`}
              >
                <Icon
                  className={`size-5 transition-colors duration-200 ${active ? "text-white" : "text-brand/40 dark:text-white/60"}`}
                  strokeWidth={active ? 2.4 : 2.1}
                />
                {!!badge && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center border-2 border-white dark:border-black">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span
                className={`text-[10px] font-bold leading-none transition-colors duration-200 ${
                  active ? "text-accent" : "text-brand/35 dark:text-white/40"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
