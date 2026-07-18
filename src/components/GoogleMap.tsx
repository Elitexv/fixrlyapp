import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  return import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
}

function loadMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__gmapLoading) return window.__gmapLoading;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;
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

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        mapRef.current = new window.google.maps.Map(ref.current, {
          center,
          zoom,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
        });
      })
      .catch((e) => console.error(e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return <div ref={ref} className={`w-full h-full ${className}`} />;
}
