import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/theme";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

// Google Maps ignores the page's CSS theme entirely, so without an explicit
// dark style array it always paints its default light basemap — a jarring
// light-gray box in the middle of an otherwise dark page.
const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a3a3a3" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#3a3a3a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2b2b2b" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f1f2e" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];
const LIGHT_MAP_STYLES = [{ featureType: "poi", stylers: [{ visibility: "off" }] }];

type Marker = { lat: number; lng: number; label?: string; id?: string; onClick?: () => void };

declare global {
  interface Window {
    google?: any;
    __initGoogleMap?: () => void;
    __gmapLoading?: Promise<void>;
  }
}

async function resolveMapKey(): Promise<string | undefined> {
  try {
    const { data } = await supabase
      .from("admin_settings" as any)
      .select("publishable_key")
      .eq("id", "map")
      .maybeSingle();
    const k = (data as any)?.publishable_key?.trim();
    if (k) return k;
  } catch {
    /* fall through to env */
  }
  return import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
}

function loadMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__gmapLoading) return window.__gmapLoading;
  const channel = import.meta.env.VITE_GOOGLE_MAPS_TRACKING_ID as string | undefined;
  window.__gmapLoading = (async () => {
    const key = await resolveMapKey();
    if (!key) throw new Error("Missing Google Maps browser key");
    await new Promise<void>((resolve, reject) => {
      window.__initGoogleMap = () => resolve();
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initGoogleMap${channel ? `&channel=${channel}` : ""}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error("Failed to load Google Maps"));
      document.head.appendChild(script);
    });
  })();
  return window.__gmapLoading;
}

export function GoogleMap({
  center,
  markers = [],
  zoom = 12,
  className = "",
}: {
  center: { lat: number; lng: number };
  markers?: Marker[];
  zoom?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const { resolvedTheme } = useTheme();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        const fallbackCenter = center ?? { lat: 9.082, lng: 8.6753 };
        mapRef.current = new window.google.maps.Map(ref.current, {
          center: fallbackCenter,
          zoom,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: resolvedTheme === "dark" ? DARK_MAP_STYLES : LIGHT_MAP_STYLES,
        });
        // Constructing the Map object succeeds even when tiles never
        // actually paint (e.g. an API key not authorized for this
        // referrer) — wait for a real "tilesloaded" so the placeholder
        // doesn't disappear in front of a still-blank map.
        const timeout = setTimeout(() => { if (!cancelled) setStatus("error"); }, 6000);
        window.google.maps.event.addListenerOnce(mapRef.current, "tilesloaded", () => {
          clearTimeout(timeout);
          if (!cancelled) setStatus("ready");
        });
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setStatus("error");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setOptions({ styles: resolvedTheme === "dark" ? DARK_MAP_STYLES : LIGHT_MAP_STYLES });
  }, [resolvedTheme]);

  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    mapRef.current.setCenter(center);
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = markers.map((m) => {
      const marker = new window.google.maps.Marker({
        position: { lat: m.lat, lng: m.lng },
        map: mapRef.current,
        label: m.label
          ? { text: m.label, color: "#ffffff", fontSize: "11px", fontWeight: "700" }
          : undefined,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: "#ff5a1f",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      if (m.onClick) marker.addListener("click", m.onClick);
      return marker;
    });
  }, [markers]);

  return (
    <div className={cn("relative w-full h-full", className)}>
      <div ref={ref} className="w-full h-full" />
      {status !== "ready" && (
        <div className="absolute inset-0 grid place-items-center bg-canvas pointer-events-none">
          {status === "loading" ? (
            <div className="size-8 rounded-full border-2 border-brand/15 border-t-accent animate-spin" />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-brand/40">
              <MapPin className="size-6" />
              <span className="text-[11px] font-semibold">Map unavailable</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
