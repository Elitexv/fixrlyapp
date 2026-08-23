import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { GoogleMap } from "@/components/GoogleMap";
import { haversineKm } from "@/lib/session";
import { getDrivingEta } from "@/lib/directions.functions";
import { Navigation } from "lucide-react";

const MIN_ETA_REFRESH_MS = 25000;

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

  const fetchEta = useServerFn(getDrivingEta);
  const [eta, setEta] = useState<{ distanceText: string; durationText: string } | null>(null);
  const lastFetchedAt = useRef(0);

  // Driving ETA is a paid API call per fetch — throttle independently of how
  // often the provider's location ping arrives (as often as every 15s, see
  // startLocationSharing). Skips a refresh within the window rather than
  // queuing one for later; the next location update after the window closes
  // will pick it up, so staleness tops out around one throttle window.
  useEffect(() => {
    if (destLat == null || destLng == null) return;
    if (Date.now() - lastFetchedAt.current < MIN_ETA_REFRESH_MS) return;
    lastFetchedAt.current = Date.now();
    let cancelled = false;
    fetchEta({ data: { originLat: providerLat, originLng: providerLng, destLat, destLng } })
      .then((res) => {
        if (!cancelled) setEta({ distanceText: res.distanceText, durationText: res.durationText });
      })
      .catch(() => {
        // Falls back to the straight-line distance already shown below —
        // no need to surface an error for a background ETA refresh.
      });
    return () => {
      cancelled = true;
    };
  }, [providerLat, providerLng, destLat, destLng, fetchEta]);

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
          {eta
            ? `Arriving in ~${eta.durationText} · ${eta.distanceText}`
            : distanceKm != null && `${distanceKm.toFixed(1)} km away`}
          {freshness && (eta || distanceKm != null) && " · "}
          {freshness && `updated ${freshness}`}
        </span>
      </div>
    </div>
  );
}
