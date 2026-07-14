import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  accent?: boolean;
  className?: string;
};

export function StatCard({ label, value, accent, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl p-4",
        accent
          ? "bg-gradient-to-br from-accent/10 via-brand/5 to-surface"
          : "border border-brand/5 bg-surface",
        className,
      )}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand/40">{label}</div>
      <div className={cn("mt-2 font-mono text-2xl font-black", accent ? "text-accent" : "text-brand")}>
        {value}
      </div>
    </div>
  );
}
