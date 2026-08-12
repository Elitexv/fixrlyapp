import { GoogleMap } from "@/components/GoogleMap";
import { haversineKm } from "@/lib/session";
import { Navigation } from "lucide-react";

export function ProviderTrackingMap({
  providerLat,
  providerLng,
  destLat,
  destLng,
  updatedAt,
}: {
  providerLat: number;
  providerLng: number;
  destLat: number | null;
  destLng: number | null;
  updatedAt: string | null;
}) {
  const distanceKm =
    destLat != null && destLng != null
      ? haversineKm({ lat: providerLat, lng: providerLng }, { lat: destLat, lng: destLng })
      : null;

  const markers = [
    { lat: providerLat, lng: providerLng, label: "🚗" },
    ...(destLat != null && destLng != null ? [{ lat: destLat, lng: destLng, label: "🏠" }] : []),
  ];

  const secondsAgo = updatedAt ? Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000)) : null;
  const freshness = secondsAgo == null ? null : secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.floor(secondsAgo / 60)}m ago`;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-orange-100">
      <div className="h-40 w-full">
        <GoogleMap center={{ lat: providerLat, lng: providerLng }} markers={markers} zoom={13} />
      </div>
      <div className="flex items-center justify-between gap-2 bg-orange-50 px-3 py-2 text-[11px] font-bold text-orange-700">
        <span className="inline-flex items-center gap-1.5">
          <Navigation className="size-3.5 animate-pulse" /> Provider is on the way
        </span>
        <span className="text-orange-600/80">
          {distanceKm != null && `${distanceKm.toFixed(1)} km away`}
          {distanceKm != null && freshness && " · "}
          {freshness && `updated ${freshness}`}
        </span>
      </div>
    </div>
  );
}
