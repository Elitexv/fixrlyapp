import { supabase } from "@/integrations/supabase/client";

const MIN_PING_INTERVAL_MS = 15000;

/**
 * Streams the provider's position into bookings.provider_lat/lng while a
 * booking is on_the_way, throttled so a moving GPS fix doesn't hammer the
 * DB. The enforce_booking_update_rules trigger only accepts these pings from
 * the assigned provider while that exact booking is on_the_way, so a stale
 * call after completion/cancellation just fails silently server-side.
 * Returns a stop function (clears the geolocation watch).
 */
export function startLocationSharing(bookingId: string, onError?: (message: string) => void): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError?.("Geolocation isn't available on this device");
    return () => {};
  }

  let lastSentAt = 0;

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const now = Date.now();
      if (now - lastSentAt < MIN_PING_INTERVAL_MS) return;
      lastSentAt = now;
      supabase
        .from("bookings")
        .update({
          provider_lat: pos.coords.latitude,
          provider_lng: pos.coords.longitude,
          provider_location_updated_at: new Date().toISOString(),
        })
        .eq("id", bookingId)
        .then(({ error }) => {
          if (error) console.warn("[provider-tracking] location ping failed", error.message);
        });
    },
    (err) => onError?.(err.message || "Couldn't read your location"),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
  );

  return () => navigator.geolocation.clearWatch(watchId);
}

/** One-shot read of the current position, used for the initial accepted -> on_the_way snapshot. */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation isn't available on this device"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(new Error(err.message || "Couldn't read your location")), {
      enableHighAccuracy: true,
      timeout: 20000,
    });
  });
}
