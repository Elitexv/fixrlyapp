import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Real driving distance/ETA between two points via Google's Distance Matrix API (same key as geocodeLocation). */
export const getDrivingEta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { originLat: number; originLng: number; destLat: number; destLng: number }) => {
    const nums = [data?.originLat, data?.originLng, data?.destLat, data?.destLng];
    if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) {
      throw new Error("originLat/originLng/destLat/destLng are required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const gmKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!gmKey) throw new Error("Google Maps API key not configured");

    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&mode=driving` +
      `&origins=${data.originLat},${data.originLng}&destinations=${data.destLat},${data.destLng}&key=${gmKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      console.error("Distance Matrix failed", res.status, body);
      throw new Error(`Distance Matrix failed (${res.status})`);
    }
    const json = (await res.json()) as {
      status: string;
      error_message?: string;
      rows: Array<{ elements: Array<{ status: string; distance?: { text: string; value: number }; duration?: { text: string; value: number } }> }>;
    };
    const element = json.rows?.[0]?.elements?.[0];
    if (json.status !== "OK" || !element || element.status !== "OK" || !element.distance || !element.duration) {
      console.error("Distance Matrix element error", json.status, element?.status, json.error_message);
      throw new Error("Could not compute driving ETA");
    }

    return {
      distanceKm: element.distance.value / 1000,
      distanceText: element.distance.text,
      durationMinutes: Math.round(element.duration.value / 60),
      durationText: element.duration.text,
    };
  });
