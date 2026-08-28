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
      className="fixed inset-x-4 z-40 mx-auto max-w-lg rounded-[26px] bg-[#0f172a]/95 backdrop-blur-xl px-3 py-2.5 shadow-[0_20px_44px_rgba(15,23,42,0.35)]"
      style={{ bottom: "max(env(safe-area-inset-bottom), 1rem)" }}
    >
      <div className="flex items-center justify-between">
        {items.map(({ to, label, icon: Icon, badge }: any) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link key={to} to={to} aria-label={label} className="flex flex-1 justify-center py-1 transition-transform duration-200 active:scale-90">
              <span
                className={`relative grid place-items-center rounded-2xl px-4 py-2 transition-all duration-200 ${
                  active ? "bg-accent shadow-lg shadow-accent/30" : ""
                }`}
              >
                <Icon
                  className="size-5 transition-colors duration-200"
                  strokeWidth={active ? 2.4 : 2.1}
                  color={active ? "#ffffff" : "rgba(255,255,255,0.5)"}
                />
                {!!badge && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-white text-[9px] font-bold grid place-items-center border-2 border-[#0f172a]">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
