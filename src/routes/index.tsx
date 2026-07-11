import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { haversineKm, useRoles, useSession } from "@/lib/session";
import { geocodeLocation } from "@/lib/geocode.functions";
import { BottomNav } from "@/components/BottomNav";
import { GoogleMap } from "@/components/GoogleMap";
import { ProviderCard, type ProviderCardData } from "@/components/ProviderCard";
import { Search, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Find local service pros near you — Nearby" },
      { name: "description", content: "Search vetted local service providers by category and location. Book cleaning, plumbing, tutoring, pet care, and more in your city." },
    ],
  }),
  component: Home,
});

type Category = { id: string; slug: string; name: string; icon: string | null };

function Home() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { data: roles } = useRoles(user);
  const geocode = useServerFn(geocodeLocation);

  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [locationText, setLocationText] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from("service_categories").select("id,slug,name,icon").order("sort_order");
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["providers", selectedCat],
    queryFn: async (): Promise<ProviderCardData[]> => {
      let q = supabase
        .from("provider_profiles")
        .select("id,business_name,bio,hourly_rate,city,photo_urls,availability_note,latitude,longitude,provider_categories(category_id,service_categories(name)),reviews(rating)")
        .eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []).map((row: any) => {
        const ratings: number[] = (row.reviews ?? []).map((r: any) => r.rating);
        const rating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
        const category_names: string[] = (row.provider_categories ?? [])
          .map((pc: any) => pc.service_categories?.name)
          .filter(Boolean);
        return {
          id: row.id,
          business_name: row.business_name,
          bio: row.bio,
          hourly_rate: row.hourly_rate,
          city: row.city,
          photo_urls: row.photo_urls ?? [],
          availability_note: row.availability_note,
          category_names,
          rating,
          review_count: ratings.length,
          latitude: row.latitude,
          longitude: row.longitude,
          _cat_ids: (row.provider_categories ?? []).map((pc: any) => pc.category_id) as string[],
        };
      });
      if (selectedCat) rows = rows.filter((r) => r._cat_ids.includes(selectedCat));
      return rows as any;
    },
  });

  const filtered = useMemo(() => {
    let list = providers as (ProviderCardData & { latitude: number | null; longitude: number | null })[];
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.business_name?.toLowerCase().includes(q) ||
          p.category_names.some((n) => n.toLowerCase().includes(q)) ||
          (p.city ?? "").toLowerCase().includes(q),
      );
    }
    const withDistance = list.map((p) => ({
      ...p,
      distance_km:
        coords && p.latitude != null && p.longitude != null
          ? haversineKm(coords, { lat: p.latitude, lng: p.longitude })
          : null,
    }));
    withDistance.sort((a, b) => {
      if (a.distance_km == null && b.distance_km == null) return 0;
      if (a.distance_km == null) return 1;
      if (b.distance_km == null) return -1;
      return a.distance_km - b.distance_km;
    });
    return withDistance;
  }, [providers, query, coords]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not available");
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Current location" });
        setLocationText("Current location");
        setGeoLoading(false);
      },
      (err) => {
        toast.error(err.message || "Couldn't get location");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const submitLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationText.trim()) return;
    setGeoLoading(true);
    try {
      const res = await geocode({ data: { query: locationText.trim() } });
      if (!res.found) {
        toast.error("Location not found");
      } else {
        setCoords({ lat: res.lat, lng: res.lng, label: res.formatted });
        setLocationText(res.formatted);
      }
    } catch (err: any) {
      toast.error(err.message || "Search failed");
    } finally {
      setGeoLoading(false);
    }
  };

  useEffect(() => {
    if (!coords && typeof window !== "undefined" && navigator.geolocation) {
      // Non-blocking attempt
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Current location" }),
        () => {},
        { timeout: 4000 },
      );
    }
  }, [coords]);

  const mapCenter = coords ?? { lat: 40.7128, lng: -74.006 };
  const markers = filtered
    .filter((p) => p.latitude != null && p.longitude != null)
    .slice(0, 30)
    .map((p) => ({ lat: p.latitude!, lng: p.longitude!, id: p.id, onClick: () => navigate({ to: "/provider/$id", params: { id: p.id } }) }));

  return (
    <div className="min-h-screen bg-canvas font-sans text-brand pb-24">
      <header className="sticky top-0 z-30 bg-surface border-b border-brand/5 px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand/40">Location</span>
            <span className="text-sm font-semibold truncate">{coords?.label ?? "Set your location below"}</span>
          </div>
          <button
            onClick={() => navigate({ to: user ? "/profile" : "/auth" })}
            className="size-10 bg-brand/5 rounded-full grid place-items-center border border-brand/10 text-sm font-bold text-brand"
          >
            {user?.email?.[0]?.toUpperCase() ?? "?"}
          </button>
        </div>

        <form onSubmit={submitLocation} className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-brand/40" />
            <input
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              placeholder="City, ZIP, or address"
              className="w-full bg-canvas rounded-xl py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={geoLoading}
            className="px-3 rounded-xl bg-brand/5 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
          >
            {geoLoading ? <Loader2 className="size-4 animate-spin" /> : "GPS"}
          </button>
        </form>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-brand/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for cleaning, plumbing, tutoring..."
            className="w-full bg-canvas rounded-xl py-3.5 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
      </header>

      <div className="flex gap-3 overflow-x-auto px-4 py-4 no-scrollbar">
        <button
          onClick={() => setSelectedCat(null)}
          className={`flex-none px-5 py-2.5 rounded-full text-xs font-medium transition-colors ${!selectedCat ? "bg-brand text-white" : "bg-surface border border-brand/5 shadow-sm"}`}
        >
          All Services
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCat(c.id === selectedCat ? null : c.id)}
            className={`flex-none px-5 py-2.5 rounded-full text-xs font-medium transition-colors ${selectedCat === c.id ? "bg-brand text-white" : "bg-surface border border-brand/5 shadow-sm"}`}
          >
            <span className="mr-1">{c.icon}</span>
            {c.name}
          </button>
        ))}
      </div>

      <div className="px-4 mb-6">
        <div className="relative w-full h-44 rounded-2xl overflow-hidden border border-brand/10 shadow-sm bg-canvas">
          <GoogleMap center={mapCenter} markers={markers} zoom={coords ? 12 : 10} />
          <div className="absolute bottom-3 left-3 pointer-events-none">
            <div className="bg-surface px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-xl flex items-center gap-2">
              <span className="size-1.5 bg-green-500 rounded-full animate-pulse" />
              {filtered.length} PROS {coords ? "NEAR YOU" : "AVAILABLE"}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-8 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-lg">
            {coords ? "Nearest to you" : "Top providers"}
          </h2>
          <span className="text-xs font-bold text-brand/40 font-mono uppercase">{filtered.length} results</span>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-16 text-brand/40">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-brand/60">
            No providers match yet.{" "}
            {!roles?.includes("provider") && (
              <button onClick={() => navigate({ to: "/dashboard" })} className="text-accent font-bold underline">
                Become a provider
              </button>
            )}
          </div>
        ) : (
          filtered.map((p) => <ProviderCard key={p.id} p={p} />)
        )}
      </div>

      <BottomNav />
    </div>
  );
}
