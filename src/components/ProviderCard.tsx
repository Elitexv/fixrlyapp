import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { Tile } from "@/components/ui-kit";

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
  return (
    <Tile as={Link} to="/provider/$id" params={{ id: p.id }} className="block hover:border-accent/20">
      <div className="flex gap-4">
        <div className="size-20 rounded-2xl bg-canvas flex-none overflow-hidden grid place-items-center text-brand/40 text-2xl font-bold">
          {p.photo_urls[0] ? (
            <img src={p.photo_urls[0]} alt={p.business_name} className="w-full h-full object-cover" />
          ) : (
            initial
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <h3 className="font-bold leading-tight truncate">{p.business_name}</h3>
              <p className="text-xs text-brand/60 mt-0.5 truncate">
                {p.category_names[0] ?? "Service Pro"}
                {p.city ? ` • ${p.city}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-brand/5 px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0">
              <Star className="size-3 fill-yellow-500 text-yellow-500" />
              {p.rating ? p.rating.toFixed(1) : "New"}
              {p.review_count > 0 && <span className="text-brand/40">({p.review_count})</span>}
            </div>
          </div>

          <div className="flex gap-4 mt-3 font-mono text-[10px] font-bold uppercase tracking-tighter">
            {p.distance_km !== null && (
              <div className="flex flex-col">
                <span className="text-brand/40">Distance</span>
                <span>{p.distance_km.toFixed(1)} km</span>
              </div>
            )}
            {p.hourly_rate !== null && (
              <div className="flex flex-col">
                <span className="text-brand/40">Rate</span>
                <span className="text-accent">₦{Number(p.hourly_rate).toFixed(0)}/hr</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-brand/5 flex items-center justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] text-brand/40 font-bold uppercase">Availability</span>
          <span className="text-xs font-semibold text-green-600 truncate">
            {p.availability_note ?? "Available soon"}
          </span>
        </div>
        <span className="bg-accent text-white px-5 py-2 rounded-xl text-xs font-bold shadow-lg shadow-accent/20 shrink-0">
          View & Book
        </span>
      </div>
    </Tile>
  );
}
