import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: "default" | "brand" | "accent";
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  variant = "default",
  className,
}: PageHeaderProps) {
  const variants = {
    default: "bg-gradient-to-br from-accent/15 via-brand/8 to-surface text-brand",
    brand: "bg-brand text-white",
    accent: "bg-gradient-to-br from-accent/25 via-brand/10 to-surface text-brand",
  };

  return (
    <header className={cn("relative overflow-hidden px-5 pt-8 pb-10", variants[variant], className)}>
      <div className="pointer-events-none absolute -right-16 top-6 h-44 w-44 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute left-6 top-10 h-28 w-28 rounded-full bg-brand/8 blur-3xl" />
      <div className="relative mx-auto flex max-w-6xl items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p
              className={cn(
                "text-xs font-bold uppercase tracking-[0.28em]",
                variant === "brand" ? "text-white/60" : "text-accent/80",
              )}
            >
              {eyebrow}
            </p>
          )}
          <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
          {description && (
            <p
              className={cn(
                "mt-2 max-w-2xl text-sm",
                variant === "brand" ? "text-white/70" : "text-brand/60",
              )}
            >
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
    </header>
  );
}
