import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared visual language for the consumer-facing app (home, bookings, profile,
 * provider pages, messages, admin). Keeps hero headers, panels, tiles, buttons,
 * badges, and empty/loading states consistent everywhere so the orange accent
 * and rounded, soft-shadow "marketplace" look reads as one product.
 */

/* ---------- App sidebar surface ---------- */
// Pages with their own shadcn `<SidebarProvider>` (business, admin) call
// this so that sidebar matches the app-wide navy AppSidebar instead of the
// shadcn default. Scoped to <body> (not just the calling component's tree)
// because the Sidebar's mobile drawer is a Radix portal appended outside it.
// Dark mode keeps pure black, same as AppSidebar.
export function useAppSidebarSurface() {
  React.useEffect(() => {
    const body = document.body;
    const dark = document.documentElement.classList.contains("dark");
    const overrides: [string, string][] = [
      ["--sidebar", dark ? "#000000" : "#0b1730"],
      ["--sidebar-foreground", "rgba(255,255,255,0.9)"],
      ["--sidebar-primary", "var(--accent)"],
      ["--sidebar-primary-foreground", "#ffffff"],
      ["--sidebar-accent", "rgba(255,255,255,0.08)"],
      ["--sidebar-accent-foreground", "#ffffff"],
      ["--sidebar-border", "rgba(255,255,255,0.1)"],
      ["--sidebar-ring", "var(--accent)"],
    ];
    overrides.forEach(([k, v]) => body.style.setProperty(k, v));
    return () => overrides.forEach(([k]) => body.style.removeProperty(k));
  }, []);
}

/* ---------- Hero header (gradient, decorative blobs) ---------- */
export function PageHero({
  eyebrow,
  title,
  description,
  className,
  actions,
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("relative overflow-hidden bg-[#0b1730] px-5 pt-[max(env(safe-area-inset-top),1.5rem)] pb-12 text-white", className)}>
      <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-accent/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-blue-500/15 blur-3xl" />
      <div className="relative max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">{eyebrow}</p>}
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight">{title}</h1>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
        {description && <p className="mt-2 max-w-3xl text-sm text-white/70">{description}</p>}
        {children}
      </div>
    </header>
  );
}

/* ---------- Compact sticky header (search bars, back nav, etc.) ---------- */
export function StickyHeader({ className, wide, children }: { className?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <header className={cn("sticky top-0 z-20 bg-surface/90 backdrop-blur-xl border-b border-soft px-4 pt-[max(env(safe-area-inset-top),1.25rem)] pb-4", className)}>
      <div className={cn("mx-auto", wide ? "max-w-lg lg:max-w-6xl" : "max-w-lg")}>{children}</div>
    </header>
  );
}

/* ---------- Panel: main content section container ---------- */
export function Panel({
  className,
  children,
  as: Comp = "section",
  ...rest
}: { className?: string; children: React.ReactNode; as?: any } & Record<string, any>) {
  return (
    <Comp className={cn("rounded-2xl border border-soft bg-surface p-5 sm:p-6 shadow-[0_8px_30px_rgba(15,23,42,0.06)]", className)} {...rest}>
      {children}
    </Comp>
  );
}

/* ---------- ProviderAvatar: profile pic, falling back to a business photo, then initials ---------- */
export function ProviderAvatar({
  name,
  avatarUrl,
  photoUrl,
  className,
}: {
  name: string | null | undefined;
  avatarUrl?: string | null;
  photoUrl?: string | null;
  className?: string;
}) {
  const initial = name?.[0]?.toUpperCase() ?? "?";
  // Try the avatar, then the business photo, then fall back to the initial —
  // a dead image URL would otherwise render the browser's broken-image icon.
  const candidates = [avatarUrl, photoUrl].filter((u): u is string => !!u);
  const [failed, setFailed] = React.useState(0);
  const image = candidates[failed];
  return (
    <div className={cn("shrink-0 overflow-hidden bg-canvas grid place-items-center font-bold text-brand/40", className)}>
      {image ? (
        <img
          key={image}
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed((n) => n + 1)}
          className="h-full w-full bg-white object-cover"
        />
      ) : (
        initial
      )}
    </div>
  );
}

/* ---------- Tile: repeating list-item card (provider card, booking card, message row) ---------- */
export function Tile({
  className,
  children,
  as: Comp = "div",
  ...rest
}: { className?: string; children: React.ReactNode; as?: any } & Record<string, any>) {
  return (
    <Comp
      className={cn(
        "rounded-xl border border-soft bg-surface p-4 shadow-sm transition hover:shadow-md",
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/* ---------- Buttons ---------- */
const buttonBase = "inline-flex items-center justify-center gap-2 font-semibold transition disabled:opacity-60 disabled:pointer-events-none";

export const PrimaryButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }>(
  ({ className, children, loading, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(buttonBase, "rounded-xl bg-gradient-to-r from-accent to-orange-500 px-4 py-3 text-sm text-white shadow-lg shadow-accent/25 hover:brightness-105", className)}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  ),
);
PrimaryButton.displayName = "PrimaryButton";

export const SecondaryButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonBase, "rounded-xl border border-soft bg-surface px-4 py-3 text-sm text-brand hover:bg-canvas", className)}
      {...props}
    >
      {children}
    </button>
  ),
);
SecondaryButton.displayName = "SecondaryButton";

export const GhostButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonBase, "rounded-xl px-3 py-2 text-xs text-brand/60 hover:bg-brand/5", className)}
      {...props}
    >
      {children}
    </button>
  ),
);
GhostButton.displayName = "GhostButton";

/* ---------- Text input ---------- */
export const TextField = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full bg-canvas rounded-xl border border-soft py-2.5 px-3.5 text-sm outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10",
        className,
      )}
      {...props}
    />
  ),
);
TextField.displayName = "TextField";

/* ---------- Textarea ---------- */
export const TextAreaField = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full bg-canvas rounded-xl border border-soft py-2.5 px-3.5 text-sm outline-none transition resize-none focus:border-accent/50 focus:ring-4 focus:ring-accent/10",
        className,
      )}
      {...props}
    />
  ),
);
TextAreaField.displayName = "TextAreaField";

/* ---------- Labeled form field (label + input or textarea) ---------- */
export function FormField({
  label,
  value,
  onChange,
  type = "text",
  required,
  textarea,
  rows = 3,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  textarea?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-brand">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {textarea ? (
        <TextAreaField value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} required={required} />
      ) : (
        <TextField type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} />
      )}
    </label>
  );
}

/* ---------- Modal (bottom sheet on mobile, centered dialog on desktop) ---------- */
export function Modal({
  onClose,
  children,
  className,
}: {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-end bg-black/50 sm:place-items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn("max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-soft bg-surface p-6 shadow-2xl sm:max-w-md sm:rounded-2xl", className)}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- Status badge (booking lifecycle) ---------- */
const amber = "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
const blue = "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300";
const green = "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300";
const orange = "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300";
const red = "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300";
const slate = "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70";
const bookingStatusStyles: Record<string, string> = {
  pending: amber,
  accepted: blue,
  approved: green,
  on_the_way: orange,
  rejected: red,
  completed: green,
  cancelled: slate,
  processing: blue,
  paid: green,
  failed: red,
};
const bookingStatusLabels: Record<string, string> = {
  on_the_way: "On the way",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", bookingStatusStyles[status] ?? slate, className)}>
      {bookingStatusLabels[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

/* ---------- Eyebrow label ---------- */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-[11px] font-semibold uppercase tracking-[0.14em] text-brand/50", className)}>{children}</div>;
}

/* ---------- Stat card (used in dashboards / overviews) ---------- */
export function StatCard({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl p-4 sm:p-5",
        accent
          ? "bg-gradient-to-br from-[#ff5a1f] to-[#ff8a3d] text-white shadow-[0_14px_30px_rgba(255,90,31,0.25)]"
          : "border border-soft bg-surface shadow-[0_8px_30px_rgba(15,23,42,0.06)]",
      )}
    >
      <div className={cn("text-xs font-medium", accent ? "text-white/85" : "text-brand/55")}>{label}</div>
      <div className={cn("mt-1.5 truncate text-2xl font-extrabold tracking-tight", accent ? "text-white" : "text-brand")}>{value}</div>
    </div>
  );
}

/* ---------- Full-page spinner ---------- */
export function PageSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("min-h-screen grid place-items-center bg-canvas", className)}>
      <Loader2 className="size-6 animate-spin text-brand/40" />
    </div>
  );
}

/* ---------- Inline spinner (within a panel/section) ---------- */
export function InlineSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("grid place-items-center py-16", className)}>
      <Loader2 className="size-6 animate-spin text-brand/40" />
    </div>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-center rounded-2xl border border-dashed border-brand/15 bg-surface px-6 py-12", className)}>
      {Icon && <Icon className="mx-auto mb-3 size-8 text-brand/20" />}
      <div className="text-sm font-semibold text-brand">{title}</div>
      {description && <p className="mt-1.5 text-sm text-brand/60">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- Error state: a failed query, distinct from a genuinely-empty
   result — same shape as EmptyState but with a retry action, so a network
   blip doesn't read as "there's nothing here." ---------- */
export function ErrorState({
  title = "Something went wrong",
  description = "Check your connection and try again.",
  onRetry,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("text-center rounded-2xl border border-dashed border-red-200 bg-red-50/60 px-6 py-12 dark:border-red-500/30 dark:bg-red-500/10", className)}>
      <div className="text-sm font-semibold text-red-900 dark:text-red-200">{title}</div>
      {description && <p className="mt-1.5 text-sm text-red-700/70 dark:text-red-300/80">{description}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
        >
          Try again
        </button>
      )}
    </div>
  );
}
