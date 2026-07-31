import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarCheck, User, LayoutDashboard, MessageSquare } from "lucide-react";
import { useSession, useRoles } from "@/lib/session";

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useSession();
  const { data: roles = [] } = useRoles(user);
  const isProvider = roles.includes("provider");

  const items = [
    { to: "/", label: "Home", icon: Home },
    { to: "/bookings", label: "Bookings", icon: CalendarCheck },
    { to: "/messages", label: "Messages", icon: MessageSquare },
    ...(isProvider ? [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] : []),
    { to: "/profile", label: "Profile", icon: User },
  ] as const;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-soft bg-surface/95 backdrop-blur-md shadow-[0_-8px_32px_rgba(0,0,0,0.06)] dark:shadow-[0_-8px_32px_rgba(0,0,0,0.4)] px-4 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <div className="mx-auto flex max-w-lg justify-between">
        {items.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-1 flex-col items-center gap-1 py-1.5 transition-colors duration-200 active:scale-90 ${active ? "text-accent" : "text-brand/40 hover:text-brand/70"}`}
            >
              <span className={`relative grid place-items-center rounded-xl px-3.5 py-1 transition-all duration-200 ${active ? "-translate-y-0.5 bg-accent/10 scale-105" : "scale-100"}`}>
                <Icon className="size-5 transition-transform duration-200" strokeWidth={active ? 2.5 : 2} />
                <span className={`absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent transition-all duration-200 ${active ? "opacity-100 scale-100" : "opacity-0 scale-0"}`} />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
