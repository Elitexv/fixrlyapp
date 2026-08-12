import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared visual language for the consumer-facing app (home, bookings, profile,
 * provider pages, messages, admin). Keeps hero headers, panels, tiles, buttons,
 * badges, and empty/loading states consistent everywhere so the orange accent
 * and rounded, soft-shadow "marketplace" look reads as one product.
 */

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
    <header className={cn("relative overflow-hidden bg-gradient-to-br from-accent/15 via-brand/10 to-surface px-5 pt-8 pb-12", className)}>
      <div className="pointer-events-none absolute -right-16 top-8 h-44 w-44 rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute left-6 top-10 h-28 w-28 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.28em] text-accent/70">{eyebrow}</p>}
            <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight">{title}</h1>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
        {description && <p className="mt-3 max-w-3xl text-sm text-brand/60">{description}</p>}
        {children}
      </div>
    </header>
  );
}

/* ---------- Compact sticky header (search bars, back nav, etc.) ---------- */
export function StickyHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <header className={cn("sticky top-0 z-20 bg-surface/95 backdrop-blur border-b border-soft px-4 pt-6 pb-4", className)}>
      <div className="max-w-lg mx-auto">{children}</div>
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
    <Comp className={cn("light-surface rounded-[2rem] bg-white/95 border border-soft p-6 shadow-soft", className)} {...rest}>
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
  const image = avatarUrl || photoUrl;
  const initial = name?.[0]?.toUpperCase() ?? "?";
  return (
    <div className={cn("shrink-0 overflow-hidden bg-canvas grid place-items-center font-bold text-brand/40", className)}>
      {image ? <img src={image} alt={name ?? ""} className="h-full w-full object-cover" /> : initial}
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
        "rounded-2xl bg-surface p-4 border border-brand/5 shadow-sm transition hover:shadow-md",
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/* ---------- Buttons ---------- */
const buttonBase = "inline-flex items-center justify-center gap-2 font-bold transition disabled:opacity-60 disabled:pointer-events-none";

export const PrimaryButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }>(
  ({ className, children, loading, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(buttonBase, "rounded-2xl bg-accent px-4 py-3 text-sm text-white shadow-lg shadow-accent/20 hover:bg-orange-500", className)}
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
      className={cn(buttonBase, "light-surface rounded-2xl border border-brand/10 bg-white px-4 py-3 text-sm text-brand hover:bg-slate-50", className)}
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
      className={cn(buttonBase, "rounded-xl px-3 py-2 text-xs uppercase tracking-wider text-brand/60 hover:bg-brand/5", className)}
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
        "w-full bg-canvas rounded-xl border border-transparent py-2.5 px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20",
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
        "w-full bg-canvas rounded-xl border border-transparent py-2.5 px-3 text-sm outline-none transition resize-none focus:border-accent focus:ring-2 focus:ring-accent/20",
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
      <Eyebrow className="mb-1.5">
        {label}
        {required && <span className="text-accent"> *</span>}
      </Eyebrow>
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
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/50 sm:place-items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn("max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-6 sm:max-w-md sm:rounded-3xl", className)}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- Status badge (booking lifecycle) ---------- */
const bookingStatusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  on_the_way: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-slate-100 text-slate-700",
};
const bookingStatusLabels: Record<string, string> = {
  on_the_way: "On the way",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", bookingStatusStyles[status] ?? "bg-slate-100 text-slate-700", className)}>
      {bookingStatusLabels[status] ?? status}
    </span>
  );
}

/* ---------- Eyebrow label ---------- */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-[10px] font-bold uppercase tracking-[0.24em] text-brand/40", className)}>{children}</div>;
}

/* ---------- Stat card (used in dashboards / overviews) ---------- */
export function StatCard({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cn("rounded-3xl p-5", accent ? "bg-gradient-to-br from-accent/10 via-brand/10 to-surface" : "bg-surface border border-brand/5")}>
      <div className={cn("text-[10px] font-bold uppercase tracking-[0.28em]", accent ? "text-brand/60" : "text-brand/40")}>{label}</div>
      <div className={cn("mt-2 font-mono font-black text-2xl", accent ? "text-accent" : "text-brand")}>{value}</div>
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
    <div className={cn("text-center rounded-3xl border border-dashed border-brand/10 bg-surface/60 px-6 py-12", className)}>
      {Icon && <Icon className="mx-auto mb-3 size-8 text-brand/20" />}
      <div className="text-sm font-semibold text-brand">{title}</div>
      {description && <p className="mt-1.5 text-sm text-brand/60">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
