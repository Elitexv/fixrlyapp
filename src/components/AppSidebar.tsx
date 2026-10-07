import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  CalendarCheck,
  MessageSquare,
  LayoutGrid,
  User,
  UserPlus,
  Gauge,
  Wallet,
  CircleHelp,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: LucideIcon; badge?: number; href?: string };

const SUPPORT_EMAIL = "support@fixrly.app";

// Desktop-only (lg+) counterpart to the mobile BottomNav — rendered by
// BottomNav itself so every page that already has the bottom bar gets this
// sidebar too. The `data-app-sidebar` hook is what styles.css keys the body's
// left offset on, so pages don't each need to know the sidebar's width.
export function AppSidebar({
  unreadMessages,
  isProvider,
  hasBusiness,
}: {
  unreadMessages: number;
  isProvider: boolean;
  hasBusiness: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  const main: NavItem[] = [
    { to: "/", label: "Home", icon: Home },
    { to: "/bookings", label: "Bookings", icon: CalendarCheck },
    { to: "/messages", label: "Messages", icon: MessageSquare, badge: unreadMessages },
    ...(isProvider ? [{ to: "/dashboard", label: "Dashboard", icon: LayoutGrid }] : []),
    { to: "/profile", label: "Profile", icon: User },
  ];
  // Only links the user can actually use — a customer sees the signup entry
  // point, a provider sees their business tools and earnings instead.
  const providers: NavItem[] = isProvider
    ? [
        ...(hasBusiness ? [{ to: "/business", label: "Provider Dashboard", icon: Gauge }] : []),
        { to: "/payouts", label: "Earnings", icon: Wallet },
      ]
    : [{ to: "/become-provider", label: "Become a Provider", icon: UserPlus }];
  const support: NavItem[] = [
    { to: "", href: `mailto:${SUPPORT_EMAIL}`, label: "Help & FAQs", icon: CircleHelp },
    { to: "/profile", label: "Settings", icon: Settings },
  ];

  return (
    <aside
      data-app-sidebar
      className="fixed inset-y-0 left-0 z-30 hidden w-[16.5rem] flex-col overflow-y-auto bg-[#0b1730] text-white no-scrollbar lg:flex dark:bg-black dark:border-r dark:border-white/10"
    >
      <Link to="/" className="flex items-center gap-1.5 px-7 pt-7 pb-8" aria-label="Fixrly home">
        <LogoMark className="size-11 text-accent" />
        <span className="text-[2rem] font-extrabold tracking-tight leading-none">fixrly</span>
      </Link>

      <nav aria-label="Main" className="flex flex-col gap-1 px-4">
        {main.map((item) => (
          <SidebarLink key={item.to} item={item} active={isActive(item.to)} primary />
        ))}
      </nav>

      <SidebarSection title="For Providers">
        {providers.map((item) => (
          <SidebarLink key={item.to} item={item} active={isActive(item.to)} />
        ))}
      </SidebarSection>

      <SidebarSection title="Support">
        {support.map((item) => (
          <SidebarLink key={item.label} item={item} active={false} />
        ))}
      </SidebarSection>

      <div className="mx-4 mt-auto mb-6 pt-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex -space-x-2" aria-hidden="true">
            {["bg-accent", "bg-blue-500", "bg-emerald-500"].map((c) => (
              <span key={c} className={cn("grid size-8 place-items-center rounded-full border-2 border-[#0b1730] dark:border-black", c)}>
                <User className="size-4 text-white" />
              </span>
            ))}
          </div>
          <p className="mt-4 text-lg font-bold">Need help?</p>
          <p className="mt-1 text-sm text-white/70">Our support team is here 24/7</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="mt-4 flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-orange-500"
          >
            Contact Support
          </a>
        </div>
      </div>
    </aside>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-4 mt-6 border-t border-white/10 pt-5">
      <p className="px-3 pb-2 text-sm font-medium text-white/60">{title}</p>
      <nav aria-label={title} className="flex flex-col gap-0.5">
        {children}
      </nav>
    </div>
  );
}

function SidebarLink({ item, active, primary }: { item: NavItem; active: boolean; primary?: boolean }) {
  const { icon: Icon, label, badge } = item;
  const className = cn(
    "relative flex items-center gap-3.5 rounded-xl px-3.5 transition",
    primary ? "py-3 text-[15px] font-semibold" : "py-2.5 text-sm font-medium",
    active
      ? "bg-gradient-to-r from-accent to-orange-500 text-white shadow-lg shadow-accent/30"
      : "text-white/90 hover:bg-white/[0.06] hover:text-white",
  );
  const content = (
    <>
      <Icon className={primary ? "size-[22px]" : "size-5"} strokeWidth={1.9} />
      <span className="flex-1">{label}</span>
      {!!badge && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </>
  );
  if (item.href) {
    return (
      <a href={item.href} className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link to={item.to} aria-current={active ? "page" : undefined} className={className}>
      {content}
    </Link>
  );
}
