import { Link } from "@tanstack/react-router";
import { ArrowRight, Star } from "lucide-react";
import { Tile } from "@/components/ui-kit";
import { formatMoney, useCurrency } from "@/lib/currency";

export type ProviderCardData = {
  id: string;
  business_name: string;
  bio: string | null;
  hourly_rate: number | null;
  city: string | null;
  photo_urls: string[];
  availability_note: string | null;
  category_names: string[];
  rating: number | null;
  review_count: number;
  distance_km: number | null;
};

export function ProviderCard({ p }: { p: ProviderCardData }) {
  const initial = p.business_name?.[0]?.toUpperCase() ?? "?";
  const currency = useCurrency();
  return (
    <Tile as={Link} to="/provider/$id" params={{ id: p.id }} className="block hover:border-accent/20">
      <div className="flex gap-4">
        <div className="size-20 rounded-2xl bg-canvas flex-none overflow-hidden grid place-items-center text-brand/40 text-2xl font-bold">
          {p.photo_urls[0] ? (
            <img src={p.photo_urls[0]} alt={p.business_name} className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-semibold leading-tight text-brand">{p.business_name}</h3>
              <div className="mt-1 flex flex-wrap gap-2">
                <span className="rounded-full bg-brand/5 px-2.5 py-1 text-[11px] font-medium text-brand/65">
                  {p.category_names[0] ?? "Service Pro"}
                </span>
                {p.city && (
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                    {p.city}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 bg-brand/5 px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0">
              <Star className="size-3 fill-yellow-500 text-yellow-500" />
              {p.rating ? p.rating.toFixed(1) : "New"}
              {p.review_count > 0 && <span className="text-amber-500">({p.review_count})</span>}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
            {p.distance_km !== null && (
              <div className="flex flex-col">
                <span className="text-brand/40">Distance</span>
                <span className="text-brand">{p.distance_km.toFixed(1)} km</span>
              </div>
            )}
            {p.hourly_rate !== null && (
              <div className="flex flex-col">
                <span className="text-brand/40">Rate</span>
                <span className="text-accent">{formatMoney(p.hourly_rate, currency)}/hr</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 rounded-[18px] bg-brand/5 px-3 py-3">
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand/40">Availability</span>
          <p className="truncate text-sm font-semibold text-brand/80">{p.availability_note ?? "Available soon"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-3.5 py-2 text-[11px] font-semibold text-primary-foreground">
          View
          <ArrowRight className="size-3.5" />
        </div>
      </div>
    </Tile>
  );
}
