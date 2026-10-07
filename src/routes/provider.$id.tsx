import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { haversineKm, useSession } from "@/lib/session";
import { formatDistance, useUserLocation } from "@/lib/location";
import { GoogleMap } from "@/components/GoogleMap";
import { CategoryIcon } from "@/components/CategoryVisual";
import { DesktopSidebar } from "@/components/BottomNav";
import { AppTopBar } from "@/components/AppTopBar";
import {
  ArrowLeft,
  Star,
  MapPin,
  Phone,
  Users,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  BadgeCheck,
  Share2,
  UserPlus,
  UserCheck,
  CalendarDays,
  CalendarCheck,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  X,
  Loader2,
  Image as ImageIcon,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { getOrCreateConversation } from "@/lib/chat";
import { formatMoney, useCurrency } from "@/lib/currency";
import { PageSpinner, ErrorState } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

const SITE_URL = "https://fixrly.app";

export const Route = createFileRoute("/provider/$id")({
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("provider_profiles")
      .select("business_name,city,photo_urls,hourly_rate,bio,provider_categories(service_categories(name)),reviews(rating)")
      .eq("id", params.id)
      .maybeSingle();
    if (!data) return null;
    const ratings = (data.reviews ?? []).map((r: any) => r.rating);
    const rating = ratings.length ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : null;
    const categoryNames = (data.provider_categories ?? []).map((pc: any) => pc.service_categories?.name).filter(Boolean);
    return {
      businessName: data.business_name as string,
      city: data.city as string | null,
      bio: data.bio as string | null,
      photoUrl: data.photo_urls?.[0] ?? null,
      hourlyRate: data.hourly_rate as number | null,
      categoryName: categoryNames[0] ?? null,
      rating,
      reviewCount: ratings.length,
    };
  },
  head: ({ params, loaderData }) => {
    const url = `${SITE_URL}/provider/${params.id}`;
    if (!loaderData) {
      return {
        meta: [{ title: "Provider profile — Fixrly" }, { name: "description", content: "Book this service provider on Fixrly." }],
        links: [{ rel: "canonical", href: url }],
      };
    }
    const { businessName, city, bio, photoUrl, categoryName, rating, reviewCount } = loaderData;
    const locality = city ? ` in ${city}` : "";
    const service = categoryName ? `${categoryName} ` : "";
    const title = `${businessName} — ${service}${categoryName ? "Services" : "Provider"}${locality} | Fixrly`;
    const description = bio
      ? bio.slice(0, 155)
      : `Book ${businessName}${locality} on Fixrly. See services, pricing, and reviews.`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "profile" },
        ...(photoUrl ? [{ property: "og:image", content: photoUrl }] : []),
        {
          "script:ld+json": {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: businessName,
            url,
            ...(photoUrl ? { image: photoUrl } : {}),
            ...(city ? { address: { "@type": "PostalAddress", addressLocality: city } } : {}),
            ...(categoryName ? { additionalType: categoryName } : {}),
            ...(rating != null
              ? { aggregateRating: { "@type": "AggregateRating", ratingValue: rating, reviewCount } }
              : {}),
          },
        },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: ProviderPage,
});


// Shared card chrome, matching the home page.
const card = "rounded-2xl border border-soft bg-surface shadow-[0_8px_30px_rgba(15,23,42,0.06)]";

function ProviderPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const currency = useCurrency();
  const [userCoords] = useUserLocation();
  const [chatLoading, setChatLoading] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("about");
  const [showMap, setShowMap] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["provider", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_profiles")
        .select("*, provider_categories(service_categories(id,name,icon,slug))")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name,avatar_url,phone")
        .eq("id", id)
        .maybeSingle();
      return { ...data, profiles: prof } as any;
    },
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id,rating,comment,created_at,customer_id")
        .eq("provider_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean)));
      let profMap = new Map<string, any>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,full_name")
          .in("id", ids);
        profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      }
      return rows.map((r) => ({ ...r, profiles: profMap.get(r.customer_id) ?? null }));
    },
  });

  const qc = useQueryClient();
  const { data: followData } = useQuery({
    queryKey: ["follows", id],
    queryFn: async () => {
      const { count } = await supabase
        .from("provider_follows" as any)
        .select("id", { count: "exact", head: true })
        .eq("provider_id", id);
      let following = false;
      if (user) {
        const { data: f } = await supabase
          .from("provider_follows" as any)
          .select("id")
          .eq("provider_id", id)
          .eq("follower_id", user.id)
          .maybeSingle();
        following = !!f;
      }
      return { count: count ?? 0, following };
    },
  });

  const openChat = async () => {
    if (!user) return navigate({ to: "/auth", search: { redirect: `/provider/${id}` } });
    if (!id) return;
    setChatLoading(true);
    try {
      const conversationId = await getOrCreateConversation(id, user.id);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("selectedConversationId", conversationId);
      }
      navigate({ to: "/messages" });
      toast.success("Opened chat");
    } catch (err: any) {
      toast.error(err.message ?? "Could not start chat");
    } finally {
      setChatLoading(false);
    }
  };

  const toggleFollow = async () => {
    if (!user) return navigate({ to: "/auth", search: { redirect: `/provider/${id}` } });
    if (followData?.following) {
      const { error } = await supabase
        .from("provider_follows" as any)
        .delete()
        .eq("provider_id", id)
        .eq("follower_id", user.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("provider_follows" as any)
        .insert({ provider_id: id, follower_id: user.id });
      if (error) return toast.error(error.message);
      toast.success("Following");
    }
    qc.invalidateQueries({ queryKey: ["follows", id] });
  };

  const { data: reactions } = useQuery({
    queryKey: ["reactions", id, user?.id],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("provider_reactions" as any)
        .select("reaction,user_id")
        .eq("provider_id", id);
      const list = (rows ?? []) as any[];
      const likes = list.filter((r) => r.reaction === "like").length;
      const dislikes = list.filter((r) => r.reaction === "dislike").length;
      const mine = user ? list.find((r) => r.user_id === user.id)?.reaction ?? null : null;
      return { likes, dislikes, mine: mine as "like" | "dislike" | null };
    },
  });

  const react = async (kind: "like" | "dislike") => {
    if (!user) return navigate({ to: "/auth", search: { redirect: `/provider/${id}` } });
    if (reactions?.mine === kind) {
      const { error } = await supabase
        .from("provider_reactions" as any)
        .delete()
        .eq("provider_id", id)
        .eq("user_id", user.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("provider_reactions" as any)
        .upsert(
          { provider_id: id, user_id: user.id, reaction: kind },
          { onConflict: "provider_id,user_id" },
        );
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["reactions", id, user?.id] });
  };

  const book = (serviceId?: string) => {
    const search = serviceId ? { service: serviceId } : {};
    if (!user) {
      const redirect = `/book/${id}${serviceId ? `?service=${serviceId}` : ""}`;
      return navigate({ to: "/auth", search: { redirect } });
    }
    navigate({ to: "/book/$id", params: { id }, search });
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: data?.business_name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  if (isLoading) {
    return <PageSpinner />;
  }
  if (isError) {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <ErrorState description="Couldn't load this provider." onRetry={() => refetch()} />
      </div>
    );
  }
  if (!data) {
    return <div className="min-h-screen grid place-items-center text-sm text-brand/60">Provider not found.</div>;
  }

  const rating = reviews.length ? reviews.reduce((a, b) => a + b.rating, 0) / reviews.length : null;
  const categories = (data.provider_categories ?? []).map((pc: any) => pc.service_categories).filter(Boolean);
  const photos: string[] = data.photo_urls ?? [];
  const avatar = (data.profiles as any)?.avatar_url || photos[0] || null;
  const distanceKm =
    userCoords && data.latitude != null && data.longitude != null
      ? haversineKm(userCoords, { lat: data.latitude, lng: data.longitude })
      : null;
  const memberSince = new Date(data.created_at).getFullYear();
  const bioIsLong = (data.bio?.length ?? 0) > 180;

  const hasCoords = data.latitude != null && data.longitude != null;
  // Only facts the app actually knows — no "ID verified"-style claims that
  // nothing in the system checks.
  const trustItems = [
    { icon: ShieldCheck, label: "Approved by Fixrly", ok: true },
    { icon: Phone, label: "Phone number on file", ok: !!data.phone },
    { icon: MapPin, label: "Business location set", ok: hasCoords },
    { icon: Star, label: "Rated by customers", ok: rating != null },
  ];
  const ratingLine = (
    <span className="flex items-center gap-1">
      <Star className="size-4 fill-yellow-400 text-yellow-400" />
      <span className="font-semibold text-white">{rating ? rating.toFixed(1) : "New"}</span>
      <span className="text-white/65">({reviews.length} {reviews.length === 1 ? "review" : "reviews"})</span>
    </span>
  );
  const goToSection = (tab: ProfileTab) => {
    setActiveTab(tab);
    document.getElementById(`${tab}-section`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const avatarCircle = (size: string) => (
    <div className="relative shrink-0">
      <div className={cn("relative grid place-items-center overflow-hidden rounded-full border-4 border-white bg-white/10 text-3xl font-bold text-white", size)}>
        {data.business_name?.[0]}
        {avatar && (
          <img src={avatar} alt="" onError={(e) => (e.currentTarget.style.display = "none")} className="absolute inset-0 h-full w-full bg-white object-cover" />
        )}
      </div>
      <BadgeCheck className="absolute bottom-0.5 right-0.5 size-7 fill-blue-500 text-white" aria-label="Approved provider" />
    </div>
  );
  const followButton = (
    <button
      type="button"
      onClick={toggleFollow}
      aria-pressed={followData?.following}
      className={cn(
        "flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-lg transition",
        followData?.following ? "bg-white/15 text-white ring-1 ring-white/30" : "bg-white text-blue-600 hover:bg-blue-50",
      )}
    >
      {followData?.following ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
      {followData?.following ? "Following" : "Follow"}
    </button>
  );
  const shareButton = (
    <button
      type="button"
      onClick={share}
      aria-label="Share profile"
      className="grid size-11 shrink-0 place-items-center rounded-full border border-white/25 bg-black/25 text-white backdrop-blur-md transition hover:bg-black/40"
    >
      <Share2 className="size-5" />
    </button>
  );

  return (
    <div className="min-h-screen bg-canvas pb-28 text-brand lg:pb-12">
      <DesktopSidebar />
      <AppTopBar />

      {/* ---------- Mobile cover / identity ---------- */}
      <header className="relative overflow-hidden bg-[#0b1730] text-white lg:hidden">
        {photos[0] && <img src={photos[0]} alt="" onError={(e) => (e.currentTarget.style.display = "none")} className="absolute inset-0 h-full w-full object-cover opacity-45" />}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1730] via-[#0b1730]/85 to-[#0b1730]/30" />
        <div className="relative mx-auto max-w-3xl px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? window.history.back() : navigate({ to: "/" }))}
              aria-label="Back"
              className="grid size-11 place-items-center rounded-full border border-white/20 bg-black/25 backdrop-blur-md transition hover:bg-black/40"
            >
              <ArrowLeft className="size-5" />
            </button>
            {shareButton}
          </div>

          <div className="mt-5 flex items-center gap-4">
            {avatarCircle("size-24 sm:size-28")}
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-1.5 text-2xl font-extrabold tracking-tight sm:text-3xl">
                <span className="truncate">{data.business_name}</span>
                <BadgeCheck className="size-6 shrink-0 fill-blue-500 text-white" aria-hidden="true" />
              </h1>
              {(data.city || distanceKm !== null) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/90">
                  <MapPin className="size-4" />
                  {data.city}
                  {distanceKm !== null && (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">{formatDistance(distanceKm)} away</span>
                  )}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13px] text-white/85">
                <span>Approved Provider</span>
                <span className="text-white/40">•</span>
                {ratingLine}
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">{followButton}</div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-4 lg:max-w-[1240px] lg:px-6 lg:pt-5">
        <button
          type="button"
          onClick={() => navigate({ to: "/", hash: "providers" })}
          className="mb-4 hidden items-center gap-2 text-sm text-brand/60 transition hover:text-accent lg:flex"
        >
          <ArrowLeft className="size-4" /> Back to providers
        </button>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
          <main className="space-y-4">
            {/* ---------- Desktop hero ---------- */}
            <section className="relative hidden overflow-hidden rounded-2xl bg-[#0b1730] text-white shadow-[0_18px_40px_rgba(11,23,48,0.25)] lg:block">
              {photos[0] && (
                <img
                  src={photos[0]}
                  alt=""
                  onError={(e) => (e.currentTarget.style.display = "none")}
                  className="absolute inset-y-0 right-0 h-full w-3/5 object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-[#0b1730] via-[#0b1730]/90 to-[#0b1730]/20" />
              <div className="relative flex min-h-[10.5rem] items-center gap-6 p-7">
                {avatarCircle("size-28")}
                <div className="min-w-0 flex-1">
                  <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
                    <span className="truncate">{data.business_name}</span>
                    <BadgeCheck className="size-7 shrink-0 fill-blue-500 text-white" aria-hidden="true" />
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-white/90">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-4" /> {data.city ?? "Location not set"}
                    </span>
                    {distanceKm !== null && (
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">{formatDistance(distanceKm)} away</span>
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 text-sm text-white/85">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="size-4 fill-white text-[#0b1730]" /> Approved Provider
                    </span>
                    {ratingLine}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 self-end">
                  {followButton}
                  {shareButton}
                </div>
              </div>
            </section>

            {/* ---------- Stats ---------- */}
            <section className={cn(card, "grid grid-cols-4 divide-x divide-[var(--soft-border)] py-4 lg:py-5")} aria-label="Provider stats">
              <ProfileStat icon={Star} tone="bg-amber-100 text-amber-500 dark:bg-amber-500/15" value={rating ? rating.toFixed(1) : "New"} label="Rating" />
              <ProfileStat icon={MessageSquare} tone="bg-blue-100 text-blue-600 dark:bg-blue-500/15" value={String(reviews.length)} label="Reviews" />
              <ProfileStat icon={Users} tone="bg-green-100 text-green-600 dark:bg-green-500/15" value={String(followData?.count ?? 0)} label="Followers" />
              <ProfileStat icon={CalendarDays} tone="bg-violet-100 text-violet-600 dark:bg-violet-500/15" value={String(memberSince)} label="On Fixrly since" />
            </section>

            {/* ---------- About (with desktop section tabs) ---------- */}
            <section id="about-section" className={cn(card, "scroll-mt-28 p-5")} aria-labelledby="about">
              <nav className="-mx-5 -mt-1 mb-4 hidden gap-8 border-b border-soft px-5 lg:flex" aria-label="Profile sections">
                {PROFILE_TABS.filter((t) => (t.id === "services" ? categories.length > 0 : t.id === "portfolio" ? photos.length > 0 : true)).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => goToSection(t.id)}
                    aria-current={activeTab === t.id ? "true" : undefined}
                    className={cn(
                      "-mb-px border-b-2 pb-3 text-[15px] font-medium transition",
                      activeTab === t.id ? "border-accent font-semibold text-accent" : "border-transparent text-brand/65 hover:text-brand",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
              <h2 id="about" className="text-lg font-bold lg:sr-only">About</h2>
              {data.bio ? (
                <p className={cn("mt-2 text-sm leading-relaxed text-brand/70 lg:mt-0", !bioExpanded && bioIsLong && "line-clamp-4")}>{data.bio}</p>
              ) : (
                <p className="mt-2 text-sm text-brand/50 lg:mt-0">This provider hasn't written a bio yet.</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <TrustChip>Approved by Fixrly</TrustChip>
                {rating != null && <TrustChip>Rated by customers</TrustChip>}
                {data.phone && <TrustChip>Phone on file</TrustChip>}
              </div>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-soft pt-4">
                <div className="flex min-w-0 items-start gap-3">
                  <MapPin className="mt-0.5 size-5 shrink-0 fill-brand text-brand [&>circle]:fill-white dark:[&>circle]:fill-black" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Service Area</div>
                    <div className="text-xs text-brand/55">
                      {data.city ? `${data.city} and surrounding areas` : "Surrounding areas"} (up to {data.service_radius_km}km)
                    </div>
                  </div>
                </div>
                {bioIsLong && (
                  <button type="button" onClick={() => setBioExpanded((v) => !v)} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-accent">
                    {bioExpanded ? "Show less" : "Read more"} <ChevronDown className={cn("size-4 transition", bioExpanded && "rotate-180")} />
                  </button>
                )}
              </div>
            </section>

            {/* ---------- Services & pricing ---------- */}
            {categories.length > 0 && (
              <section id="services-section" className={cn(card, "scroll-mt-28 p-5")} aria-labelledby="services">
                <div className="flex items-center justify-between">
                  <h2 id="services" className="flex items-center gap-2.5 text-lg font-bold">
                    <Wrench className="hidden size-5 text-accent lg:block" />
                    <span className="lg:hidden">Services &amp; Pricing</span>
                    <span className="hidden lg:inline">Services</span>
                  </h2>
                  <button type="button" onClick={() => book()} className="flex items-center gap-1 text-sm font-medium text-blue-600">
                    Book <ChevronRight className="size-4" />
                  </button>
                </div>
                <div className="-mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
                  {categories.map((c: any) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => book(c.id)}
                      className="flex w-36 flex-none flex-col items-start rounded-xl border border-soft bg-surface p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-md lg:w-auto lg:flex-row lg:gap-3"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-50 dark:bg-orange-500/10">
                        <CategoryIcon slug={c.slug} emoji={c.icon} className="size-5 text-xl" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="mt-3 line-clamp-2 text-sm font-semibold leading-snug lg:mt-0">{c.name}</span>
                        {data.hourly_rate != null ? (
                          <>
                            <span className="mt-2 text-base font-bold text-accent">{formatMoney(data.hourly_rate, currency)}</span>
                            <span className="text-xs text-brand/50">per hour</span>
                          </>
                        ) : (
                          <span className="mt-2 text-xs text-brand/50">Price on request</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ---------- Portfolio ---------- */}
            {photos.length > 0 && (
              <section id="portfolio-section" className={cn(card, "scroll-mt-28 p-5")} aria-labelledby="portfolio">
                <div className="flex items-center justify-between">
                  <h2 id="portfolio" className="flex items-center gap-2.5 text-lg font-bold">
                    <ImageIcon className="hidden size-5 text-accent lg:block" /> Portfolio
                  </h2>
                  <span className="text-xs text-brand/50">
                    {photos.length} {photos.length === 1 ? "photo" : "photos"}
                  </span>
                </div>
                <div className="-mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
                  {photos.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setLightbox(url)}
                      aria-label={`View photo ${i + 1}`}
                      className="relative h-24 w-32 flex-none overflow-hidden rounded-xl bg-canvas sm:h-28 sm:w-40 lg:h-32 lg:w-auto"
                    >
                      <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition hover:scale-105" />
                      <span className="absolute bottom-1.5 right-1.5 grid size-6 place-items-center rounded-md bg-black/55 text-white">
                        <ImageIcon className="size-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ---------- Availability (mobile; desktop shows it in the side column) ---------- */}
            <section className={cn(card, "flex items-center gap-3 p-4 sm:p-5 lg:hidden")} aria-labelledby="availability">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-orange-50 text-accent dark:bg-orange-500/10">
                <CalendarDays className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="availability" className="text-sm font-semibold">Availability</h2>
                <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-brand/70">
                  <span className="size-2 shrink-0 rounded-full bg-green-500" />
                  <span className="truncate">{data.availability_note || "Ask the provider for their schedule"}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => book()}
                className="flex shrink-0 items-center gap-2 rounded-full border border-accent px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent hover:text-white"
              >
                <CalendarCheck className="size-4" /> Book Now
              </button>
            </section>

            {/* ---------- Map (mobile) ---------- */}
            {hasCoords && (
              <section className={cn(card, "overflow-hidden lg:hidden")} aria-label="Location">
                <div className="h-44">
                  <GoogleMap center={{ lat: data.latitude, lng: data.longitude }} markers={[{ lat: data.latitude, lng: data.longitude, id: data.id }]} zoom={13} />
                </div>
              </section>
            )}

            {/* ---------- Reviews ---------- */}
            <section id="reviews-section" className={cn(card, "scroll-mt-28 p-5")} aria-labelledby="reviews">
              <div className="flex items-center justify-between gap-3">
                <h2 id="reviews" className="flex items-center gap-2.5 text-lg font-bold">
                  <Star className="hidden size-5 text-accent lg:block" /> Reviews
                </h2>
                <div className="flex gap-2">
                  <ReactionButton
                    active={reactions?.mine === "like"}
                    onClick={() => react("like")}
                    label="Like"
                    count={reactions?.likes ?? 0}
                    icon={ThumbsUp}
                    activeClass="bg-green-600 text-white"
                    hoverClass="hover:bg-green-50 hover:text-green-700"
                  />
                  <ReactionButton
                    active={reactions?.mine === "dislike"}
                    onClick={() => react("dislike")}
                    label="Dislike"
                    count={reactions?.dislikes ?? 0}
                    icon={ThumbsDown}
                    activeClass="bg-red-600 text-white"
                    hoverClass="hover:bg-red-50 hover:text-red-700"
                  />
                </div>
              </div>
              {reviews.length === 0 ? (
                <p className="mt-3 text-sm text-brand/50">No reviews yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--soft-border)]">
                  {reviews.map((r) => (
                    <li key={r.id} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-canvas text-xs font-bold text-brand/60">
                            {(r.profiles?.full_name ?? "C")[0]?.toUpperCase()}
                          </span>
                          <span className="truncate text-sm font-semibold">{r.profiles?.full_name ?? "Customer"}</span>
                        </div>
                        <div className="flex items-center gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} aria-hidden="true" className={cn("size-3.5", i < r.rating ? "fill-amber-400 text-amber-400" : "text-brand/20")} />
                          ))}
                        </div>
                      </div>
                      {r.comment && <p className="mt-1.5 pl-[2.625rem] text-sm text-brand/75">{r.comment}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </main>

          {/* ---------- Desktop side column ---------- */}
          <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block">
            <section className={cn(card, "p-5")} aria-labelledby="trust">
              <div className="flex items-start gap-3.5">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-green-600 text-white shadow-md shadow-green-600/25">
                  <ShieldCheck className="size-6" />
                </span>
                <div>
                  <h2 id="trust" className="text-base font-bold">Trusted Provider</h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-brand/55">Reviewed and approved by Fixrly before listing.</p>
                </div>
              </div>
              <ul className="mt-4 divide-y divide-[var(--soft-border)] border-t border-soft">
                {trustItems.map(({ icon: Icon, label, ok }) => (
                  <li key={label} className="flex items-center gap-3 py-3 text-sm">
                    <Icon className="size-4 shrink-0 text-brand/70" />
                    <span className="flex-1">{label}</span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        ok ? "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400" : "bg-canvas text-brand/45",
                      )}
                    >
                      {ok ? "Yes" : "Not yet"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className={cn(card, "p-5")} aria-labelledby="pricing">
              <h2 id="pricing" className="text-lg font-bold">Pricing &amp; Availability</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-soft p-3">
                  <div className="text-xs text-brand/60">Starting price</div>
                  <div className="mt-1 text-xl font-extrabold text-accent">
                    {data.hourly_rate != null ? formatMoney(data.hourly_rate, currency) : "—"}
                    {data.hourly_rate != null && <span className="text-sm font-medium text-brand/60"> /hr</span>}
                  </div>
                </div>
                <div className="flex gap-2 rounded-xl border border-soft p-3">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-brand/60" />
                  <div className="min-w-0">
                    <div className="text-xs text-brand/60">Availability</div>
                    <div className="mt-1 line-clamp-2 text-sm font-semibold">{data.availability_note || "Ask the provider"}</div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => book()}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange-500 text-[15px] font-semibold text-white shadow-lg shadow-accent/30 transition hover:brightness-105"
              >
                <CalendarCheck className="size-5" /> Book a Service
              </button>
              <div className={cn("mt-2.5 grid gap-2.5", data.phone ? "grid-cols-2" : "grid-cols-1")}>
                <button
                  type="button"
                  onClick={openChat}
                  disabled={chatLoading}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#0b1730]/20 text-sm font-medium transition hover:bg-canvas disabled:opacity-60 dark:border-white/20"
                >
                  {chatLoading ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />} {data.phone ? "Message" : "Message Provider"}
                </button>
                {data.phone && (
                  <a
                    href={`tel:${data.phone}`}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#0b1730]/20 text-sm font-medium transition hover:bg-canvas dark:border-white/20"
                  >
                    <Phone className="size-4" /> Call
                  </a>
                )}
              </div>
            </section>

            <section className={cn(card, "p-5")} aria-labelledby="location">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <h2 id="location" className="text-base font-bold">Location</h2>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{data.city ?? "Not set"}</div>
                      <div className="text-xs text-brand/55">Service radius: up to {data.service_radius_km}km</div>
                    </div>
                    {hasCoords && (
                      <button type="button" onClick={() => setShowMap((v) => !v)} aria-expanded={showMap} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-accent">
                        {showMap ? "Hide map" : "View on map"} <ChevronRight className={cn("size-3.5 transition", showMap && "rotate-90")} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {hasCoords && showMap && (
                <div className="mt-4 h-48 overflow-hidden rounded-xl border border-soft">
                  <GoogleMap center={{ lat: data.latitude, lng: data.longitude }} markers={[{ lat: data.latitude, lng: data.longitude, id: data.id }]} zoom={13} />
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      {/* ---------- Mobile action bar ---------- */}
      <div className="light-surface fixed inset-x-0 bottom-0 z-40 border-t border-soft bg-white/95 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5">
          <button
            type="button"
            onClick={openChat}
            disabled={chatLoading}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-blue-50 text-sm font-semibold text-[#0b1730] transition hover:bg-blue-100 disabled:opacity-60"
          >
            {chatLoading ? <Loader2 className="size-5 animate-spin" /> : <MessageSquare className="size-5" />}
            Chat
          </button>
          {data.phone && (
            <a
              href={`tel:${data.phone}`}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-blue-50 text-sm font-semibold text-[#0b1730] transition hover:bg-blue-100"
            >
              <Phone className="size-5 fill-current" /> Call
            </a>
          )}
          <button
            type="button"
            onClick={() => book()}
            className="flex h-12 flex-[1.6] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-accent to-orange-500 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:brightness-105"
          >
            <CalendarCheck className="size-5" /> Book a Service
          </button>
        </div>
      </div>

      {/* ---------- Photo viewer ---------- */}
      {lightbox && (
        <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" onClick={() => setLightbox(null)}>
          <button type="button" aria-label="Close" className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/15 text-white">
            <X className="size-5" />
          </button>
          <img src={lightbox} alt="" className="max-h-[85vh] max-w-full rounded-2xl object-contain" />
        </div>
      )}
    </div>
  );
}

type ProfileTab = "about" | "services" | "portfolio" | "reviews";
const PROFILE_TABS: { id: ProfileTab; label: string }[] = [
  { id: "about", label: "About" },
  { id: "services", label: "Services" },
  { id: "portfolio", label: "Portfolio" },
  { id: "reviews", label: "Reviews" },
];

function ProfileStat({ icon: Icon, tone, value, label }: { icon: typeof Star; tone: string; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-1 text-center lg:flex-row lg:justify-center lg:gap-3.5 lg:px-4 lg:text-left">
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-full lg:size-12", tone)}>
        <Icon className={cn("size-5", Icon === Star && "fill-current")} strokeWidth={1.8} />
      </span>
      <span className="flex flex-col items-center gap-1.5 lg:items-start lg:gap-1">
        <span className="mt-1 text-lg font-bold leading-none lg:mt-0 lg:text-xl">{value}</span>
        <span className="text-[11px] leading-tight text-brand/55 sm:text-xs lg:text-[13px]">{label}</span>
      </span>
    </div>
  );
}

function TrustChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1.5 text-xs font-medium">
      <ShieldCheck className="size-4 fill-[#0b1730] text-white dark:fill-white dark:text-black" />
      {children}
    </span>
  );
}

function ReactionButton({
  active,
  onClick,
  label,
  count,
  icon: Icon,
  activeClass,
  hoverClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon: typeof ThumbsUp;
  activeClass: string;
  hoverClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition", active ? activeClass : cn("bg-canvas text-brand", hoverClass))}
    >
      <Icon className={cn("size-4", active && "fill-white")} />
      {count}
    </button>
  );
}
