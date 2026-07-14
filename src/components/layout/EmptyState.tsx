import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-brand/5 bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <div className="mx-auto mb-4 flex justify-center">{icon}</div>}
      <h3 className="text-base font-bold">{title}</h3>
      {description && <p className="mt-2 text-sm text-brand/60">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
