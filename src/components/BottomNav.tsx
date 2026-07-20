import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarCheck, User, LayoutDashboard, Shield } from "lucide-react";
import { useSession, useRoles } from "@/lib/session";

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useSession();
  const { data: roles = [] } = useRoles(user);
  const isProvider = roles.includes("provider");
  const isAdmin = roles.includes("admin");

  const items = [
    { to: "/", label: "Home", icon: Home, shortLabel: "Home" },
    { to: "/bookings", label: "Bookings", icon: CalendarCheck, shortLabel: "Book" },
    ...(isProvider ? [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, shortLabel: "Dash" }] : []),
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: Shield, shortLabel: "Admin" }] : []),
    { to: "/profile", label: "Profile", icon: User, shortLabel: "Me" },
  ] as const;

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 px-2.5 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-1 rounded-[1.1rem] border border-brand/10 bg-white/95 p-0.75 shadow-[0_14px_32px_rgba(17,28,58,0.14)] backdrop-blur-xl">
          {items.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex min-h-[2.6rem] flex-1 flex-col items-center justify-center gap-[0.15rem] rounded-[0.8rem] px-1.25 py-1.25 transition-all ${active ? "bg-gradient-to-br from-brand to-slate-700 text-white shadow-sm shadow-brand/20" : "text-brand/55 hover:bg-brand/5 hover:text-brand"}`}
              >
                <Icon className="size-4.2" strokeWidth={active ? 2.2 : 2} />
                <span className="text-[8px] font-semibold uppercase tracking-[0.14em] leading-none">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-72 flex-col border-r border-brand/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,248,240,0.96))] px-5 py-6 shadow-[12px_0_40px_rgba(17,28,58,0.06)] lg:flex">
        <div className="mb-8 rounded-2xl border border-brand/10 bg-gradient-to-br from-brand/10 via-white to-orange-100/80 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-brand/60">Nearby</p>
          <h2 className="mt-2 text-lg font-black text-slate-800">Service hub</h2>
          <p className="mt-1 text-sm text-slate-600">Book, manage, and discover local pros.</p>
        </div>

        <div className="space-y-2">
          {items.map(({ to, label, shortLabel, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition-all ${active ? "bg-gradient-to-br from-brand to-slate-700 text-white shadow-lg shadow-brand/20" : "text-slate-700 hover:bg-brand/5 hover:text-brand"}`}
              >
                <div className={`rounded-xl p-2 ${active ? "bg-white/15" : "bg-brand/5"}`}>
                  <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                </div>
                <span>{label}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-auto rounded-2xl border border-brand/10 bg-white/80 p-4 text-sm text-slate-600 shadow-sm">
          <p className="font-semibold text-slate-800">Fast access</p>
          <p className="mt-1 text-sm text-slate-600">Use the desktop rail to jump between home, bookings, and your profile.</p>
        </div>
      </aside>
    </>
  );
}
