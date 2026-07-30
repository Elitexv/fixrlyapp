import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Geocode a free-form location string (city / ZIP / address) using Google Maps via the connector gateway. */
export const geocodeLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { query: string }) => {
    if (!data || typeof data.query !== "string" || !data.query.trim()) {
      throw new Error("query is required");
    }
    if (data.query.length > 200) throw new Error("query too long");
    return { query: data.query.trim() };
  })
  .handler(async ({ data }) => {
    const gmKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!gmKey) throw new Error("Google Maps API key not configured");

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(data.query)}&key=${gmKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      console.error("Geocode failed", res.status, body);
      throw new Error(`Geocode failed (${res.status})`);
    }
    const json = (await res.json()) as {
      status: string;
      error_message?: string;
      results: Array<{
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
      }>;
    };
    if (json.status === "ZERO_RESULTS") {
      return { found: false as const };
    }
    if (json.status !== "OK" || !json.results.length) {
      console.error("Geocode API error", json.status, json.error_message);
      throw new Error(`Geocode failed: ${json.status}`);
    }
    const r = json.results[0];
    return {
      found: true as const,
      formatted: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
    };
  });
