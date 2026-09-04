import { useEffect, useState } from "react";

export type UserLocation = { lat: number; lng: number; label: string };

const STORAGE_KEY = "fixrly-location";

function readStoredLocation(): UserLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserLocation) : null;
  } catch {
    return null;
  }
}

function writeStoredLocation(loc: UserLocation | null) {
  if (typeof window === "undefined") return;
  try {
    if (loc) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / quota exceeded — fine to no-op */
  }
}

// The customer's chosen location, shared across every page (home, category
// browse, provider profile) so a location picked once — by device GPS or by
// typing a city/ZIP — keeps showing provider distances everywhere without
// re-prompting per page.
export function useUserLocation() {
  const [coords, setCoordsState] = useState<UserLocation | null>(() => readStoredLocation());

  const setCoords = (loc: UserLocation | null) => {
    setCoordsState(loc);
    writeStoredLocation(loc);
  };

  useEffect(() => {
    if (coords || typeof window === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Current location" }),
      () => {},
      { timeout: 8000, enableHighAccuracy: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  return [coords, setCoords] as const;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))}m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)}km`;
}
