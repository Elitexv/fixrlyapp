import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { haversineKm, useRoles, useSession } from "@/lib/session";
import { geocodeLocation } from "@/lib/geocode.functions";
import { fetchActiveProviders, fetchCategories, type Category } from "@/lib/providers";
import { BottomNav } from "@/components/BottomNav";
import { GoogleMap } from "@/components/GoogleMap";
import { ProviderCard, type ProviderCardData } from "@/components/ProviderCard";
import { NotificationsBell } from "@/components/NotificationsBell";
import { StickyHeader, InlineSpinner, EmptyState, Eyebrow, ProviderAvatar } from "@/components/ui-kit";
import { Search, MapPin, Loader2, Compass, SearchX } from "lucide-react";
import { toast } from "sonner";

const SITE_URL = "https://fixrly.app";

export const Route = createFileRoute("/")({
  // Server-rendered so crawlers (and the first paint) see real provider
  // listings instead of an empty shell waiting on a client-side fetch.
  loader: async () => {
    const [initialProviders, categories] = await Promise.all([fetchActiveProviders(null), fetchCategories()]);
    return { initialProviders, categories };
  },
  head: () => ({
    meta: [
      { title: "Find local service pros near you — Fixrly" },
      { name: "description", content: "Search vetted local service providers by category and location. Book cleaning, plumbing, tutoring, pet care, and more in your city with Fixrly." },
      { property: "og:url", content: `${SITE_URL}/` },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Fixrly",
          url: SITE_URL,
          description: "Search vetted local service providers by category and location.",
        },
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { data: roles } = useRoles(user);
  const geocode = useServerFn(geocodeLocation);
  const { initialProviders, categories: initialCategories } = Route.useLoaderData();

  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [locationText, setLocationText] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("avatar_url,full_name").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = initialCategories } = useQuery({
    queryKey: ["categories"],
    initialData: initialCategories,
    queryFn: fetchCategories,
  });

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["providers", selectedCat],
    initialData: selectedCat === null ? initialProviders : undefined,
    queryFn: (): Promise<ProviderCardData[]> => fetchActiveProviders(selectedCat) as unknown as Promise<ProviderCardData[]>,
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

  // Live "quick results" dropdown under the search box, Facebook-style —
  // capped to a handful of matches with avatars; the full, sortable list
  // still renders below as `filtered` updates.
  const searchSuggestions = useMemo(() => {
    if (!query.trim()) return [];
    return filtered.slice(0, 6);
  }, [filtered, query]);

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
    <div className="min-h-screen bg-canvas font-sans text-brand pb-24">
      {/* Visually replaced by the compact header below, but the page still
          needs one real <h1> stating what it's about for crawlers and
          screen readers. */}
      <h1 className="sr-only">Find and book trusted local service providers near you</h1>
      <StickyHeader>
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col min-w-0">
            <Eyebrow>Location</Eyebrow>
            <span className="text-sm font-semibold truncate">{coords?.label ?? "Set your location below"}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationsBell />
            <button
              onClick={() => navigate({ to: user ? "/profile" : "/auth" })}
              className="size-10 overflow-hidden bg-accent/10 rounded-full grid place-items-center border border-accent/20 text-sm font-bold text-accent shrink-0 transition hover:bg-accent/20"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                user?.email?.[0]?.toUpperCase() ?? "?"
              )}
            </button>
          </div>
        </div>

        <form onSubmit={submitLocation} className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-brand/40" />
            <input
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              placeholder="City, ZIP, or address"
              className="w-full bg-canvas rounded-xl py-2.5 pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={geoLoading}
            className="px-3 rounded-xl bg-brand/5 text-xs font-bold uppercase tracking-wider text-brand/70 transition hover:bg-brand/10 disabled:opacity-50"
          >
            {geoLoading ? <Loader2 className="size-4 animate-spin" /> : "GPS"}
          </button>
        </form>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-brand/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
            placeholder="Search for cleaning, plumbing, tutoring..."
            className="w-full bg-canvas rounded-xl py-3.5 pl-11 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-accent/30"
          />

          {searchOpen && query.trim() && (
            <div className="light-surface absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 max-h-[70vh] overflow-y-auto rounded-2xl border border-soft bg-white shadow-soft">
              {searchSuggestions.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <SearchX className="size-5 text-brand/30" />
                  <p className="text-sm text-brand/60">No pros match "{query.trim()}"</p>
                </div>
              ) : (
                <>
                  {searchSuggestions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSearchOpen(false);
                        navigate({ to: "/provider/$id", params: { id: p.id } });
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-brand/5"
                    >
                      <ProviderAvatar
                        name={p.business_name}
                        avatarUrl={p.avatar_url}
                        photoUrl={p.photo_urls[0]}
                        className="size-11 rounded-full text-sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-brand">{p.business_name}</div>
                        <div className="truncate text-xs text-brand/50">
                          {[p.category_names[0], p.city].filter(Boolean).join(" · ") || "Service pro"}
                        </div>
                      </div>
                    </button>
                  ))}
                  {filtered.length > searchSuggestions.length && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setSearchOpen(false)}
                      className="w-full border-t border-soft py-2.5 text-center text-xs font-bold uppercase tracking-wider text-accent hover:bg-brand/5"
                    >
                      See all {filtered.length} results
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </StickyHeader>

      <div className="max-w-lg mx-auto">
        <div className="flex gap-2.5 overflow-x-auto px-4 py-4 no-scrollbar">
          <button
            onClick={() => setSelectedCat(null)}
            className={`flex-none px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${!selectedCat ? "bg-accent text-white shadow-lg shadow-accent/20" : "bg-surface border border-brand/5 shadow-sm text-brand/70 hover:border-accent/20"}`}
          >
            All Services
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCat(c.id === selectedCat ? null : c.id)}
              className={`flex-none px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${selectedCat === c.id ? "bg-accent text-white shadow-lg shadow-accent/20" : "bg-surface border border-brand/5 shadow-sm text-brand/70 hover:border-accent/20"}`}
            >
              <span className="mr-1">{c.icon}</span>
              {c.name}
            </button>
          ))}
        </div>

        <div className="px-4 mb-6">
          <div className="relative w-full h-44 rounded-3xl overflow-hidden border border-soft shadow-soft bg-canvas">
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
            <h2 className="text-lg font-semibold">
              {coords ? "Nearest to you" : "Top providers"}
            </h2>
            <span className="font-mono text-xs font-bold uppercase text-brand/40">{filtered.length} results</span>
          </div>

          {isLoading ? (
            <InlineSpinner />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="No providers match yet"
              description="Try a different search, category, or location."
              action={
                !roles?.includes("provider") && (
                  <button onClick={() => navigate({ to: "/dashboard" })} className="text-accent font-bold text-sm underline underline-offset-2">
                    Become a provider
                  </button>
                )
              }
            />
          ) : (
            filtered.map((p) => <ProviderCard key={p.id} p={p} />)
          )}
        </div>

        {categories.length > 0 && (
          <div className="px-4 pb-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-brand/40 mb-3">Browse services</h2>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Link
                  key={c.id}
                  to="/services/$categorySlug"
                  params={{ categorySlug: c.slug }}
                  className="rounded-full bg-surface border border-brand/5 px-4 py-2 text-xs font-semibold text-brand/70 shadow-sm transition hover:border-accent/20 hover:text-brand"
                >
                  {c.icon} {c.name} near you
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
