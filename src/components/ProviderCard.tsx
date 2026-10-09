import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Clock, MapPin, Star } from "lucide-react";
import { ProviderAvatar } from "@/components/ui-kit";
import { formatMoney, useCurrency } from "@/lib/currency";
import { formatDistance } from "@/lib/location";

export type ProviderCardData = {
  id: string;
  business_name: string;
  bio: string | null;
  hourly_rate: number | null;
  city: string | null;
  photo_urls: string[];
  avatar_url?: string | null;
  availability_note: string | null;
  category_names: string[];
  rating: number | null;
  review_count: number;
  distance_km: number | null;
};

export function ProviderCard({ p }: { p: ProviderCardData }) {
  const currency = useCurrency();
  return (
    <Link
      to="/provider/$id"
      params={{ id: p.id }}
      className="group flex min-w-0 flex-col gap-3.5 rounded-2xl border border-soft bg-surface p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-[0_14px_36px_rgba(15,23,42,0.1)]"
    >
      <div className="flex gap-3.5">
        <div className="relative shrink-0">
          <ProviderAvatar
            name={p.business_name}
            avatarUrl={p.avatar_url}
            photoUrl={p.photo_urls[0]}
            className="size-16 rounded-2xl text-2xl"
          />
          <BadgeCheck className="absolute -bottom-1 -right-1 size-5 fill-blue-500 text-white" aria-label="Approved provider" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-[15px] font-bold leading-tight text-brand">{p.business_name}</h3>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <Star className="size-3 fill-amber-400 text-amber-400" />
              {p.rating ? p.rating.toFixed(1) : "New"}
              {p.review_count > 0 && <span className="font-normal opacity-70">({p.review_count})</span>}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-medium text-accent dark:bg-orange-500/10">
              {p.category_names[0] ?? "Service Pro"}
            </span>
            {(p.city || p.distance_km !== null) && (
              <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-brand/55">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">
                  {p.city}
                  {p.city && p.distance_km !== null && " · "}
                  {p.distance_km !== null && (
                    <span className="font-semibold text-brand/75">
                      {formatDistance(p.distance_km)}
                      {!p.city && " away"}
                    </span>
                  )}
                </span>
              </span>
            )}
          </div>
          {p.availability_note && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-brand/55">
              <Clock className="size-3 shrink-0" />
              <span className="truncate">{p.availability_note}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-soft pt-3.5">
        <div>
          {p.hourly_rate !== null ? (
            <>
              <span className="text-base font-extrabold text-brand">{formatMoney(p.hourly_rate, currency)}</span>
              <span className="text-xs text-brand/50"> /hr</span>
            </>
          ) : (
            <span className="text-xs text-brand/50">Price on request</span>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-accent to-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-accent/20 transition group-hover:brightness-105">
          View profile <ArrowRight className="size-3.5" />
        </span>
      </div>
    </Link>
  );
}
