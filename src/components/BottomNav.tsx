import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarCheck, User, LayoutDashboard, MessageSquare, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSession, useRoles, useMyBusiness } from "@/lib/session";
import { fetchTotalUnreadCount } from "@/lib/chat";
import { AppSidebar } from "@/components/AppSidebar";
import { cn } from "@/lib/utils";

function useNavState() {
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
  return { isProvider, hasBusiness: !!business, unreadMessages };
}

// Just the desktop sidebar, for pages that bring their own mobile action
// bar instead of the bottom tab bar (e.g. the provider profile).
export function DesktopSidebar() {
  const { isProvider, hasBusiness, unreadMessages } = useNavState();
  return <AppSidebar unreadMessages={unreadMessages} isProvider={isProvider} hasBusiness={hasBusiness} />;
}

export function BottomNav() {
  const { pathname, hash } = useRouterState({ select: (s) => ({ pathname: s.location.pathname, hash: s.location.hash }) });
  const { isProvider, hasBusiness, unreadMessages } = useNavState();

  const onProviderList = pathname === "/" && hash === "providers";
  // Providers get their dashboard in the fourth slot; everyone else gets a
  // shortcut to the provider list on the home page.
  const items = [
    { to: "/", label: "Home", icon: Home, active: pathname === "/" && !onProviderList },
    { to: "/bookings", label: "Bookings", icon: CalendarCheck, active: pathname.startsWith("/bookings") },
    { to: "/messages", label: "Messages", icon: MessageSquare, badge: unreadMessages, active: pathname.startsWith("/messages") },
    isProvider
      ? { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, active: pathname.startsWith("/dashboard") }
      : { to: "/", hash: "providers", label: "Providers", icon: Users, active: onProviderList },
    { to: "/profile", label: "Profile", icon: User, active: pathname.startsWith("/profile") },
  ];

  return (
    <>
      <AppSidebar unreadMessages={unreadMessages} isProvider={isProvider} hasBusiness={hasBusiness} />
      <nav
        aria-label="Main"
        className="light-surface fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl lg:hidden dark:border-white/10 dark:bg-black/95"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between">
          {items.map(({ to, hash: itemHash, label, icon: Icon, badge, active }) => (
            <Link
              key={label}
              to={to}
              hash={itemHash}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 transition active:scale-95"
            >
              <span className="relative">
                <Icon
                  className={cn("size-6 transition-colors", active ? "fill-accent/15 text-accent" : "text-brand/45 dark:text-white/55")}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                {!!badge && (
                  <span className="absolute -top-1.5 -right-2 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-white bg-accent px-1 text-[10px] font-bold text-white dark:border-black">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span className={cn("text-[11px] leading-none", active ? "font-semibold text-accent" : "font-medium text-brand/55 dark:text-white/55")}>
                {label}
              </span>
              <span className={cn("mt-0.5 h-[3px] w-8 rounded-full", active ? "bg-accent" : "bg-transparent")} />
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
