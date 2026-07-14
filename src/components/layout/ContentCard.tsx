import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ContentCardProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ContentCard({ title, description, action, children, className }: ContentCardProps) {
  return (
    <section className={cn("rounded-2xl border border-brand/5 bg-surface p-5 shadow-sm", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-bold">{title}</h2>}
            {description && <p className="mt-1 text-sm text-brand/60">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
