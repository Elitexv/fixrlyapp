import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { haversineKm, useRoles, useSession } from "@/lib/session";
import { useUserLocation } from "@/lib/location";
import { geocodeLocation } from "@/lib/geocode.functions";
import { fetchActiveProviders, fetchCategories } from "@/lib/providers";
import { fetchTotalUnreadCount } from "@/lib/chat";
import { formatMoney, useCurrency } from "@/lib/currency";
import { BottomNav } from "@/components/BottomNav";
import { GoogleMap } from "@/components/GoogleMap";
import { LogoMark } from "@/components/Logo";
import { ProviderCard, type ProviderCardData } from "@/components/ProviderCard";
import { NotificationsBell } from "@/components/NotificationsBell";
import { CategoryIcon, categoryVisual } from "@/components/CategoryVisual";
import { InlineSpinner, EmptyState, ErrorState, ProviderAvatar, StatusBadge } from "@/components/ui-kit";
import {
  Search,
  MapPin,
  Loader2,
  Compass,
  SearchX,
  LocateFixed,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Users,
  ShieldCheck,
  Star,
  CalendarCheck,
  UserPlus,
  Gauge,
  MessageSquare,
  Wrench,
  Zap,
  SprayCan,
  ThumbsUp,
  CalendarX,
  SlidersHorizontal,
  Map as MapIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn, shortDisplayName } from "@/lib/utils";

const SITE_URL = "https://fixrly.app";
const MAX_DISTANCE_KM = 40;

// GeolocationPositionError.message is a raw, unfriendly browser string (e.g.
// "User denied Geolocation"). PERMISSION_DENIED specifically means the
// browser's site-level permission is blocked — the app can't re-prompt for
// it, only the user can flip it back on in browser settings — so tell them
// that and point at the manual search box (which stays fully usable either
// way) instead of leaving them stuck.
function friendlyGeoError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location access is blocked for this site. Enable it in your browser's site settings, or search by city/ZIP instead.";
    case err.POSITION_UNAVAILABLE:
      return "Couldn't determine your location. Try searching by city/ZIP instead.";
    case err.TIMEOUT:
      return "Location request timed out. Try again, or search by city/ZIP instead.";
    default:
      return err.message || "Couldn't get your location.";
  }
}

export const Route = createFileRoute("/")({
  // `q` pre-fills the search box — set by the top bar's search on other pages.
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
  }),
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

// Shared card chrome for every home-page section, matching the dashboard
// look: white surface, hairline border, soft shadow.
const card = "rounded-2xl border border-soft bg-surface shadow-[0_8px_30px_rgba(15,23,42,0.06)]";

function Home() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { data: roles = [] } = useRoles(user);
  const isProvider = roles.includes("provider");
  const currency = useCurrency();
  const geocode = useServerFn(geocodeLocation);
  const { initialProviders, categories: initialCategories } = Route.useLoaderData();

  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const { q } = Route.useSearch();
  const [query, setQuery] = useState(q ?? "");
  useEffect(() => {
    if (!q) return;
    setQuery(q);
    document.getElementById("providers")?.scrollIntoView({ block: "start" });
  }, [q]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [coords, setCoords] = useUserLocation();
  const [locationText, setLocationText] = useState(coords?.label ?? "");
  const [editingLocation, setEditingLocation] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);
  // Mobile keeps the location card compact; the map opens on demand.
  const [showMap, setShowMap] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const catScrollRef = useRef<HTMLDivElement>(null);

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

  // Whether the category row has more tiles off to the right — drives the
  // scroll arrow, which would otherwise sit on top of the last tile.
  const [catHasMore, setCatHasMore] = useState(false);
  const updateCatHasMore = () => {
    const el = catScrollRef.current;
    if (el) setCatHasMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => {
    updateCatHasMore();
    window.addEventListener("resize", updateCatHasMore);
    return () => window.removeEventListener("resize", updateCatHasMore);
  }, [categories.length]);

  const { data: providers = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["providers", selectedCat],
    initialData: selectedCat === null ? initialProviders : undefined,
    queryFn: (): Promise<ProviderCardData[]> => fetchActiveProviders(selectedCat) as unknown as Promise<ProviderCardData[]>,
  });

  // Same query key as BottomNav/AppSidebar, so this shares their cache.
  const { data: unreadMessages = 0 } = useQuery({
    queryKey: ["unread-messages-total", user?.id],
    enabled: !!user,
    queryFn: () => fetchTotalUnreadCount(user!.id),
    refetchInterval: 30_000,
  });

  const { data: recentBookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["recent-bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id,status,scheduled_at,total_price,payment_amount,provider:provider_profiles!bookings_provider_id_fkey(business_name),category:service_categories(name,slug,icon)",
        )
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data as any[];
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
    const withDistance = list
      .map((p) => ({
        ...p,
        distance_km:
          coords && p.latitude != null && p.longitude != null
            ? haversineKm(coords, { lat: p.latitude, lng: p.longitude })
            : null,
      }))
      // Only filter out providers we know are too far — a null distance
      // (no coords yet, or the provider hasn't been geocoded) stays visible
      // rather than being hidden by a check we can't actually run.
      .filter((p) => p.distance_km == null || p.distance_km <= MAX_DISTANCE_KM);
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

  // Headline numbers come from the real (unfiltered) provider list rather
  // than marketing placeholders.
  const stats = useMemo(() => {
    const ratings = initialProviders.map((p) => p.rating).filter((r): r is number => r != null);
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    return { activeProviders: initialProviders.length, avgRating: avg, ratedCount: ratings.length };
  }, [initialProviders]);

  // ⌘K / Ctrl+K focuses the search box, as the hint in it promises.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not available");
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Current location" });
        setLocationText("Current location");
        setGeoLoading(false);
        setEditingLocation(false);
      },
      (err) => {
        toast.error(friendlyGeoError(err));
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
        setEditingLocation(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Search failed");
    } finally {
      setGeoLoading(false);
    }
  };

  const scrollToProviders = () => document.getElementById("providers")?.scrollIntoView({ behavior: "smooth", block: "start" });

  // The mobile search bar's filter button: jump to the location card with
  // its search form open, since location is the main filter on this page.
  const openLocationFilter = () => {
    setEditingLocation(true);
    document.getElementById("location")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const mapCenter = coords ?? { lat: 9.082, lng: 8.6753 };
  const markers = filtered
    .filter((p) => p.latitude != null && p.longitude != null)
    .slice(0, 30)
    .map((p) => ({ lat: p.latitude!, lng: p.longitude!, id: p.id, onClick: () => navigate({ to: "/provider/$id", params: { id: p.id } }) }));

  const fullName = profile?.full_name || user?.email?.split("@")[0] || "Guest";
  const displayName = shortDisplayName(profile?.full_name, user?.email);
  const roleLabel = roles.includes("admin") ? "Admin" : isProvider ? "Provider" : "User";

  const searchBox = (
    <div className="relative flex-1">
      <div className="flex items-center gap-3 rounded-full border border-soft bg-surface px-4 py-2.5 shadow-sm transition focus-within:border-accent/40 focus-within:ring-4 focus-within:ring-accent/10">
        <Search className="size-[18px] shrink-0 text-brand/45" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setSearchOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.blur();
            if (e.key === "Enter") {
              e.currentTarget.blur();
              scrollToProviders();
            }
          }}
          placeholder="Search for cleaning, plumbing, tutoring, etc..."
          aria-label="Search services"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-brand/45"
        />
        <kbd className="hidden shrink-0 rounded-md px-1.5 font-sans text-xs text-brand/40 lg:block">⌘ K</kbd>
        <button
          type="button"
          onClick={openLocationFilter}
          aria-label="Filter by location"
          className="-mr-1 grid size-8 shrink-0 place-items-center rounded-full text-brand/60 transition hover:bg-brand/5 lg:hidden"
        >
          <SlidersHorizontal className="size-[18px]" />
        </button>
      </div>

      {searchOpen && query.trim() && (
        <div className="light-surface absolute inset-x-0 top-[calc(100%+0.5rem)] z-40 max-h-[70vh] overflow-y-auto rounded-2xl border border-soft bg-white shadow-soft">
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
                  <ProviderAvatar name={p.business_name} avatarUrl={p.avatar_url} photoUrl={p.photo_urls[0]} className="size-11 rounded-full text-sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-brand">{p.business_name}</div>
                    <div className="truncate text-xs text-brand/50">{[p.category_names[0], p.city].filter(Boolean).join(" · ") || "Service pro"}</div>
                  </div>
                </button>
              ))}
              {filtered.length > searchSuggestions.length && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSearchOpen(false);
                    scrollToProviders();
                  }}
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
  );

  return (
    <div className="min-h-screen bg-canvas font-sans text-brand pb-28 lg:pb-10">
      {/* The visual headline lives in the hero banner, but the page still
          needs one real <h1> stating what it's about for crawlers and
          screen readers. */}
      <h1 className="sr-only">Find and book trusted local service providers near you</h1>

      {/* ---------- Top bar ---------- */}
      <header className="sticky top-0 z-30 border-b border-soft bg-surface/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-3 lg:gap-6 lg:px-6 lg:py-4">
          <Link to="/" className="flex items-center gap-1 lg:hidden" aria-label="Fixrly home">
            <LogoMark className="size-10 text-accent" />
            <span className="text-[1.65rem] font-extrabold tracking-tight">fixrly</span>
          </Link>
          <div className="hidden max-w-[800px] flex-1 lg:flex">{searchBox}</div>
          <div className="ml-auto flex items-center gap-2 lg:gap-4">
            <NotificationsBell />
            {user ? (
              <button
                type="button"
                onClick={() => navigate({ to: "/profile" })}
                aria-label="Your profile"
                className="flex items-center gap-2 rounded-full p-0.5 transition hover:bg-brand/5 lg:gap-3 lg:pr-2"
              >
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#0b1730] text-base font-semibold text-white lg:size-11">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    displayName[0]?.toUpperCase()
                  )}
                </span>
                <span className="hidden text-left min-[360px]:block">
                  <span title={fullName} className="block max-w-[5.5rem] truncate text-sm font-semibold lg:max-w-[8rem]">{displayName}</span>
                  <span className="block text-xs text-brand/50">{roleLabel}</span>
                </span>
                <ChevronRight className="size-4 text-brand/50 lg:hidden" /><ChevronDown className="hidden size-4 text-brand/50 lg:block" />
              </button>
            ) : (
              <Link to="/auth" className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-orange-500">
                Sign in
              </Link>
            )}
          </div>
        </div>
        <div className="px-4 pb-3 lg:hidden">{searchBox}</div>
      </header>

      <main className="mx-auto max-w-[1240px] space-y-5 px-4 pt-5 lg:space-y-6 lg:px-6 lg:pt-6">
        {/* ---------- Hero + stats ---------- */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,450px)] lg:gap-6">
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#ff5a1f] via-[#ff6d24] to-[#ff9a4a] p-6 text-white shadow-[0_18px_40px_rgba(255,90,31,0.28)] sm:p-8 max-sm:min-h-[12.5rem] max-sm:p-5">
            <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-24 right-24 size-56 rounded-full bg-white/10" />
            <div className="relative max-w-[66%] sm:max-w-[55%] lg:max-w-[60%]">
              <div className="flex items-center gap-1">
                <LogoMark className="size-9 text-white sm:size-11" />
                <span className="text-2xl font-extrabold tracking-tight sm:text-3xl">fixrly</span>
              </div>
              <h2 className="mt-3 text-[1.05rem] font-extrabold leading-tight tracking-tight sm:mt-5 sm:text-[1.75rem] xl:text-[2rem]">
                Reliable Services.
                <br />
                Right When You Need Them.
              </h2>
              <p className="mt-2 max-w-sm text-xs leading-relaxed text-white/90 sm:mt-4 sm:text-[15px]">
                Find trusted professionals for your everyday needs — fast, safe and easy.
              </p>
            </div>
            <HeroArt />
          </section>

          <section className={cn(card, "hidden grid-cols-3 gap-3 p-4 sm:grid sm:p-6 lg:grid-cols-1 lg:content-center lg:gap-5")} aria-label="Fixrly at a glance">
            <Stat icon={Users} tone="bg-gradient-to-br from-orange-400 to-accent" value={stats.activeProviders.toLocaleString()} label="Active Providers" />
            <Stat icon={ShieldCheck} tone="bg-gradient-to-br from-emerald-400 to-green-600" value={filtered.length.toLocaleString()} label={coords ? "Pros Near You" : "Pros Available"} />
            <Stat
              icon={Star}
              tone="bg-gradient-to-br from-blue-500 to-blue-700"
              value={stats.avgRating != null ? stats.avgRating.toFixed(1) : "New"}
              label={stats.avgRating != null ? "Average Rating" : "No ratings yet"}
            />
          </section>
        </div>

        {/* ---------- Category filter ---------- */}
        <section className={cn(card, "relative px-3 py-4 sm:px-6")} aria-label="Filter by category">
          <div
            ref={catScrollRef}
            onScroll={updateCatHasMore}
            className="grid grid-cols-5 gap-x-1.5 gap-y-3 sm:flex sm:gap-5 sm:overflow-x-auto sm:scroll-smooth sm:no-scrollbar"
          >
            <CategoryTile active={!selectedCat} label="All" onClick={() => setSelectedCat(null)}>
              <LayoutGrid className={cn("size-6", !selectedCat ? "text-white" : "text-brand/70")} strokeWidth={2} />
            </CategoryTile>
            {categories.map((c) => (
              <CategoryTile key={c.id} tint={categoryVisual(c.slug)?.tint} active={selectedCat === c.id} label={c.name} onClick={() => setSelectedCat(c.id === selectedCat ? null : c.id)}>
                <CategoryIcon slug={c.slug} emoji={c.icon} className={cn("size-7", selectedCat === c.id && "text-white")} />
              </CategoryTile>
            ))}
          </div>
          {catHasMore && (
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-24 items-center justify-end rounded-r-2xl bg-gradient-to-l from-surface via-surface/90 to-transparent pr-4 sm:flex">
              <button
                type="button"
                onClick={() => catScrollRef.current?.scrollBy({ left: 320, behavior: "smooth" })}
                aria-label="Scroll categories"
                className="pointer-events-auto grid size-10 place-items-center rounded-full border border-soft bg-surface shadow-md transition hover:bg-canvas"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          )}
        </section>

        {/* ---------- Location + quick actions ---------- */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,450px)] lg:gap-6">
          <section id="location" className={cn(card, "scroll-mt-40 p-4 sm:p-5")} aria-label="Your location">
            <div className="flex items-start justify-between gap-3">
              <button type="button" onClick={() => setEditingLocation((v) => !v)} className="flex min-w-0 items-start gap-3 text-left">
                <MapPin className="mt-1 size-6 shrink-0 fill-accent text-accent [&>circle]:fill-white" />
                <span className="min-w-0">
                  <span className="block text-xs text-brand/55">Current location</span>
                  <span className="flex items-center gap-1.5 text-base font-bold sm:text-lg">
                    <span className="truncate">{coords?.label ?? "Set your location"}</span>
                    <ChevronDown className="size-4 shrink-0" />
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setEditingLocation((v) => !v)}
                aria-expanded={editingLocation}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-soft bg-surface px-2.5 py-2 text-xs font-medium shadow-sm transition hover:bg-canvas sm:gap-2 sm:px-3 sm:text-sm"
              >
                <LocateFixed className="size-4" />
                <span>Change location</span>
              </button>
            </div>

            {editingLocation && (
              <form onSubmit={submitLocation} className="mt-3 flex items-center gap-2 rounded-xl border border-soft bg-canvas p-1.5 pl-3.5">
                <MapPin className="size-4 shrink-0 text-brand/40" />
                <input
                  autoFocus
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  placeholder="City, ZIP, or address"
                  aria-label="Location"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={useMyLocation}
                  disabled={geoLoading}
                  aria-label="Use my current location"
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-brand/70 transition hover:bg-brand/5 disabled:opacity-50"
                >
                  {geoLoading ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
                </button>
                <button type="submit" disabled={geoLoading} className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:opacity-60">
                  Search
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => setShowMap((v) => !v)}
              aria-expanded={showMap}
              className="mt-3 flex w-full items-center gap-2 rounded-xl bg-canvas px-3 py-2.5 text-left text-xs font-bold sm:hidden"
            >
              <span className="size-2 animate-pulse rounded-full bg-green-500" />
              <span className="flex-1">
                {filtered.length} PROS {coords ? "NEAR YOU" : "AVAILABLE"}
                
              </span>
              <span className="flex items-center gap-1 text-accent">
                <MapIcon className="size-3.5" /> {showMap ? "Hide map" : "View map"}
              </span>
            </button>

            <div className={cn("relative mt-4 h-56 overflow-hidden rounded-xl border border-soft bg-canvas sm:block sm:h-64", !showMap && "hidden")}>
              <GoogleMap center={mapCenter} markers={markers} zoom={coords ? 12 : 6} />
              <button
                type="button"
                onClick={useMyLocation}
                disabled={geoLoading}
                aria-label="Center on my location"
                className="absolute right-3 top-3 grid size-10 place-items-center rounded-xl bg-surface shadow-md transition hover:bg-canvas disabled:opacity-50"
              >
                {geoLoading ? <Loader2 className="size-5 animate-spin" /> : <LocateFixed className="size-5" />}
              </button>
              <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl bg-surface px-3.5 py-2.5 shadow-lg">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className="size-2 animate-pulse rounded-full bg-green-500" />
                  {filtered.length} PROS {coords ? "NEAR YOU" : "AVAILABLE"}
                </div>
                <div className="mt-0.5 pl-4 text-[11px] text-brand/55">Verified • Trusted • Ready</div>
              </div>
            </div>
          </section>

          <section className={cn(card, "p-4 sm:p-5")} aria-labelledby="quick-actions">
            <h2 id="quick-actions" className="text-lg font-bold">Quick Actions</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <QuickAction onClick={scrollToProviders} icon={CalendarCheck} title="Book a Service" subtitle="Find a professional" tone="bg-orange-50 text-accent dark:bg-orange-500/10" />
              {isProvider ? (
                <QuickAction to="/dashboard" icon={Gauge} title="Provider Dashboard" subtitle="Manage your jobs" tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10" />
              ) : (
                <QuickAction to="/become-provider" icon={UserPlus} title="Become a Provider" subtitle="Start earning" tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10" />
              )}
              <QuickAction to="/bookings" icon={MapPin} title="Track Bookings" subtitle="View your requests" tone="bg-green-50 text-green-600 dark:bg-green-500/10" />
              <QuickAction to="/messages" icon={MessageSquare} title="Messages" subtitle="Chat with providers" tone="bg-violet-50 text-violet-600 dark:bg-violet-500/10" badge={unreadMessages} />
            </div>
          </section>
        </div>

        {/* ---------- Popular services + recent bookings ---------- */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,450px)] lg:gap-6">
          {categories.length > 0 && (
            <section className={cn(card, "p-4 sm:p-5")} aria-labelledby="popular-services">
              <div className="flex items-center justify-between">
                <h2 id="popular-services" className="text-lg font-bold">Popular Services</h2>
                {categories.length > 4 && (
                  <button type="button" onClick={() => setShowAllServices((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-accent sm:text-brand/70 sm:hover:text-accent">
                    {showAllServices ? "Show less" : "View all"} <ArrowRight className="size-3.5" />
                  </button>
                )}
              </div>
              {/* Collapsed: a swipeable row on mobile, the first six in a grid
                  on wider screens. Expanded: everything, as a grid. */}
              <div
                className={cn(
                  "mt-4",
                  showAllServices
                    ? "grid grid-cols-3 gap-3 sm:grid-cols-6"
                    : "-mx-4 flex gap-3 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-6 sm:overflow-visible sm:px-0",
                )}
              >
                {categories.map((c, i) => {
                  const v = categoryVisual(c.slug);
                  return (
                    <Link
                      key={c.id}
                      to="/services/$categorySlug"
                      params={{ categorySlug: c.slug }}
                      className={cn(
                        "group overflow-hidden rounded-xl border border-soft bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                        !showAllServices && "w-[8.25rem] flex-none sm:w-auto",
                        !showAllServices && i >= 6 && "sm:hidden",
                      )}
                    >
                      <div className={cn("grid h-20 place-items-center bg-gradient-to-br", v?.tint ?? "from-slate-100 to-slate-50", "dark:from-white/10 dark:to-white/5")}>
                        <CategoryIcon slug={c.slug} emoji={c.icon} className="size-9 text-4xl transition group-hover:scale-110" />
                      </div>
                      <div className="px-2.5 py-2">
                        <div className="truncate text-[13px] font-semibold">{c.name}</div>
                        <div className="truncate text-[11px] text-brand/50">{v?.tagline ?? "Find a pro near you"}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <section className={cn(card, "p-4 sm:p-5")} aria-labelledby="recent-bookings">
            <div className="flex items-center justify-between">
              <h2 id="recent-bookings" className="text-lg font-bold">Recent Bookings</h2>
              {user && (
                <Link to="/bookings" className="flex items-center gap-1 text-xs font-medium text-brand/70 hover:text-accent">
                  View all <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
            {!user ? (
              <div className="mt-4 rounded-xl border border-dashed border-brand/10 px-4 py-8 text-center">
                <p className="text-sm text-brand/60">Sign in to see and track your bookings.</p>
                <Link to="/auth" className="mt-3 inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500">
                  Sign in
                </Link>
              </div>
            ) : bookingsLoading ? (
              <InlineSpinner className="py-10" />
            ) : recentBookings.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-brand/10 px-4 py-8 text-center">
                <CalendarX className="mx-auto size-6 text-brand/25" />
                <p className="mt-2 text-sm text-brand/60">No bookings yet.</p>
                <button type="button" onClick={scrollToProviders} className="mt-2 text-sm font-semibold text-accent underline underline-offset-2">
                  Book your first service
                </button>
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--soft-border)]">
                {recentBookings.map((b) => (
                  <li key={b.id}>
                    <Link to="/bookings" className="flex items-center gap-3 py-3 transition hover:opacity-80">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas">
                        {b.category ? <CategoryIcon slug={b.category.slug} emoji={b.category.icon} className="size-5 text-xl" /> : <Wrench className="size-5 text-brand/50" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{b.category?.name ?? b.provider?.business_name ?? "Booking"}</span>
                        <span className="block truncate text-xs text-brand/50">{format(new Date(b.scheduled_at), "MMM d, yyyy • h:mm a")}</span>
                      </span>
                      <StatusBadge status={b.status} className="hidden sm:inline-block" />
                      <span className="text-right">
                        <span className="block text-sm font-semibold">{formatMoney(b.total_price ?? b.payment_amount, currency)}</span>
                        <StatusBadge status={b.status} className="mt-1 inline-block sm:hidden" />
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-brand/40" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ---------- Provider results ---------- */}
        <section id="providers" className="scroll-mt-28 pt-2" aria-labelledby="providers-heading">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="providers-heading" className="text-lg font-bold">
              {coords ? "Nearest to you" : "Top providers"}
            </h2>
            <span className="font-mono text-xs font-bold uppercase text-brand/40">{filtered.length} results</span>
          </div>

          {isLoading ? (
            <InlineSpinner />
          ) : isError ? (
            <ErrorState description="Couldn't load providers." onRetry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="No providers match yet"
              description="Try a different search, category, or location."
              action={
                !isProvider && (
                  <button type="button" onClick={() => navigate({ to: "/become-provider" })} className="text-accent font-bold text-sm underline underline-offset-2">
                    Become a provider
                  </button>
                )
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => (
                <ProviderCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}

/* ---------- Home-page building blocks ---------- */

function Stat({ icon: Icon, tone, value, label }: { icon: typeof Users; tone: string; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center lg:flex-row lg:gap-4 lg:text-left">
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl text-white shadow-md lg:size-12", tone)}>
        <Icon className="size-5 lg:size-6" strokeWidth={2} />
      </span>
      <span>
        <span className="block text-lg font-bold leading-tight sm:text-2xl">{value}</span>
        <span className="block text-[11px] text-brand/55 sm:text-sm">{label}</span>
      </span>
    </div>
  );
}

function CategoryTile({
  active,
  label,
  tint,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  // Pastel gradient stops from CategoryVisual — used as the tile fill on
  // mobile; wider screens use plain white tiles.
  tint?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="group flex min-w-0 flex-col items-center gap-1.5 sm:w-20 sm:flex-none sm:gap-2">
      <span
        className={cn(
          "grid h-12 w-full max-w-[3.75rem] place-items-center rounded-xl border transition-all sm:size-[4.5rem] sm:max-w-none",
          active
            ? "border-transparent bg-gradient-to-br from-orange-400 to-accent shadow-lg shadow-accent/30"
            : cn(
                "border-soft bg-surface shadow-sm group-hover:border-accent/30 group-hover:shadow-md",
                "max-sm:border-transparent max-sm:bg-gradient-to-br max-sm:shadow-none dark:from-white/10 dark:to-white/5",
                tint ?? "from-slate-100 to-slate-50",
              ),
        )}
      >
        {children}
      </span>
      <span className={cn("w-full truncate text-center text-[11px] font-medium sm:text-[13px]", active ? "text-accent" : "text-brand/80")}>{label}</span>
      <span className={cn("h-0.5 w-10 rounded-full transition sm:w-12", active ? "bg-accent" : "bg-transparent")} />
    </button>
  );
}

function QuickAction({
  to,
  onClick,
  icon: Icon,
  title,
  subtitle,
  tone,
  badge,
}: {
  to?: string;
  onClick?: () => void;
  icon: typeof Users;
  title: string;
  subtitle: string;
  tone: string;
  badge?: number;
}) {
  const className = cn("relative flex flex-col items-start rounded-xl p-4 pr-8 text-left transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 lg:pr-5", tone);
  const content = (
    <>
      <Icon className="size-7" strokeWidth={1.8} />
      <span className="mt-3 text-sm font-bold text-brand sm:text-[15px]">{title}</span>
      <span className="mt-0.5 text-xs text-brand/55">{subtitle}</span>
      <ChevronRight className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-brand/40 lg:hidden" />
      {!!badge && (
        <span className="absolute right-3 top-3 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

// Decorative illustration for the hero banner — a cluster of trade icons
// standing in for a stock photo, so it stays crisp and on-brand at any size.
function HeroArt() {
  return (
    <div className="pointer-events-none absolute right-3 top-1/2 origin-right -translate-y-1/2 scale-[0.55] sm:right-8 sm:scale-100 xl:right-12" aria-hidden="true">
      <div className="relative size-48 xl:size-56">
        <div className="absolute inset-0 rounded-full bg-white/15" />
        <div className="absolute inset-6 grid place-items-center rounded-full bg-white shadow-2xl shadow-black/15">
          <LogoMark className="size-20 text-accent xl:size-24" />
        </div>
        <span className="absolute -left-3 top-6 grid size-14 rotate-[-10deg] place-items-center rounded-2xl bg-white shadow-xl shadow-black/15">
          <Wrench className="size-7 text-blue-600" />
        </span>
        <span className="absolute -right-2 top-2 grid size-12 rotate-[8deg] place-items-center rounded-2xl bg-white shadow-xl shadow-black/15">
          <Zap className="size-6 text-orange-500" />
        </span>
        <span className="absolute -bottom-1 left-2 grid size-12 rotate-[6deg] place-items-center rounded-2xl bg-white shadow-xl shadow-black/15">
          <SprayCan className="size-6 text-orange-500" />
        </span>
        <span className="absolute -right-4 bottom-8 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-900 shadow-xl shadow-black/15">
          <ThumbsUp className="size-4 text-green-600" /> Trusted
        </span>
      </div>
    </div>
  );
}
