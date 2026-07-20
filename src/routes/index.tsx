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
import { Search, MapPin, Loader2, Compass } from "lucide-react";
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
    <div className="min-h-screen bg-canvas pb-24 text-brand lg:pl-72">
      <div className="mx-auto flex max-w-5xl flex-col px-4 pb-8 pt-4 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-brand/10 bg-gradient-to-br from-white via-white to-orange-50/80 p-4 shadow-[0_18px_45px_rgba(17,28,58,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-accent to-[#ffb267] text-white shadow-lg shadow-accent/20">
                <Compass className="size-5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand/40">Nearby marketplace</p>
                <h1 className="text-lg font-semibold text-brand">Find trusted help fast</h1>
              </div>
            </div>
            <button
              onClick={() => navigate({ to: user ? "/profile" : "/auth" })}
              className="grid size-10 place-items-center rounded-full border border-brand/10 bg-white/80 text-sm font-semibold text-brand shadow-sm"
            >
              {user?.email?.[0]?.toUpperCase() ?? "?"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[22px] border border-brand/10 bg-white/85 p-3 shadow-sm">
              <form onSubmit={submitLocation} className="space-y-3">
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand/40" />
                  <input
                    value={locationText}
                    onChange={(e) => setLocationText(e.target.value)}
                    placeholder="City, ZIP, or address"
                    className="w-full rounded-2xl border border-brand/10 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/20"
                  />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-brand/40" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search for cleaning, plumbing, tutoring..."
                      className="w-full rounded-2xl border border-brand/10 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/20"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={geoLoading}
                    className="rounded-2xl border border-brand/10 bg-brand/5 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand transition disabled:opacity-60"
                  >
                    {geoLoading ? <Loader2 className="size-4 animate-spin" /> : "Use GPS"}
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-[22px] bg-gradient-to-br from-[#ff7a2f] via-[#ff8f42] to-[#ffb267] p-4 text-white shadow-[0_20px_45px_rgba(255,122,47,0.22)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/80">Quick view</p>
              <h2 className="mt-2 text-xl font-semibold">Browse nearby pros by service and location.</h2>
              <p className="mt-2 text-sm text-white/80">
                Compare trusted providers, see live matches, and book with confidence.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">Verified profiles</span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold">Live availability</span>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-4 rounded-[24px] border border-brand/10 bg-surface/85 p-3 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand/40">Services</p>
              <h2 className="text-base font-semibold text-brand">Browse by category</h2>
            </div>
            <span className="rounded-full bg-brand/5 px-3 py-1 text-[11px] font-semibold text-brand/65">{categories.length} options</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setSelectedCat(null)}
              className={`flex-none rounded-full px-4 py-2.5 text-xs font-semibold transition ${!selectedCat ? "bg-brand text-white shadow-lg shadow-brand/20" : "bg-white/80 text-brand/70 ring-1 ring-brand/10"}`}
            >
              All Services
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCat(c.id === selectedCat ? null : c.id)}
                className={`flex-none rounded-full px-4 py-2.5 text-xs font-semibold transition ${selectedCat === c.id ? "bg-brand text-white shadow-lg shadow-brand/20" : "bg-white/80 text-brand/70 ring-1 ring-brand/10"}`}
              >
                <span className="mr-1">{c.icon}</span>
                {c.name}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-4">
          <div className="relative h-48 overflow-hidden rounded-[24px] border border-brand/10 bg-surface/90 shadow-[0_16px_35px_rgba(17,28,58,0.08)]">
            <GoogleMap center={mapCenter} markers={markers} zoom={coords ? 12 : 10} />
            <div className="absolute inset-0 bg-gradient-to-t from-brand/12 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-3 rounded-full bg-surface/95 px-3 py-2 text-[11px] font-semibold shadow-lg backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                {filtered.length} pros {coords ? "near you" : "available"}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[24px] border border-brand/10 bg-surface/85 p-3 shadow-[0_16px_35px_rgba(17,28,58,0.06)]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand/40">Matches</p>
              <h2 className="text-base font-semibold text-brand">{coords ? "Nearest to you" : "Top providers"}</h2>
            </div>
            <span className="rounded-full bg-brand/5 px-3 py-1 text-[11px] font-semibold text-brand/60">{filtered.length} results</span>
          </div>

          {isLoading ? (
            <div className="grid place-items-center py-16 text-brand/40">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-brand/10 bg-white/70 px-4 py-12 text-center text-sm text-brand/65">
              No providers match yet. {" "}
              {!roles?.includes("provider") && (
                <button onClick={() => navigate({ to: "/dashboard" })} className="ml-1 font-semibold text-accent underline">
                  Become a provider
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((p) => <ProviderCard key={p.id} p={p} />)}
            </div>
          )}
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
