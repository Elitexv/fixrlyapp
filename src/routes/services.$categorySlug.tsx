import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { ProviderCard, type ProviderCardData } from "@/components/ProviderCard";
import { InlineSpinner, EmptyState, ErrorState } from "@/components/ui-kit";
import { AppTopBar } from "@/components/AppTopBar";
import { CategoryIcon } from "@/components/CategoryVisual";
import { fetchActiveProviders, fetchCategories, fetchCategoryBySlug } from "@/lib/providers";
import { haversineKm } from "@/lib/session";
import { useUserLocation } from "@/lib/location";
import { ArrowLeft, Compass } from "lucide-react";

const SITE_URL = "https://fixrly.app";
const MAX_DISTANCE_KM = 40;

export const Route = createFileRoute("/services/$categorySlug")({
  loader: async ({ params }) => {
    const category = await fetchCategoryBySlug(params.categorySlug);
    if (!category) throw notFound();
    const [initialProviders, categories] = await Promise.all([fetchActiveProviders(category.id), fetchCategories()]);
    return { category, initialProviders, categories };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {};
    const { category, initialProviders } = loaderData;
    const title = `${category.name} Services Near You — Book on Fixrly`;
    const description = `Find and book vetted ${category.name.toLowerCase()} providers near you. Compare rates, read reviews, and hire in minutes on Fixrly.`;
    const url = `${SITE_URL}/services/${params.categorySlug}`;
    const ratedProviders = initialProviders.filter((p) => p.rating != null);

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        {
          "script:ld+json": {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: title,
            description,
            url,
            itemListElement: ratedProviders.map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: {
                "@type": "LocalBusiness",
                name: p.business_name,
                url: `${SITE_URL}/provider/${p.id}`,
                ...(p.city ? { address: { "@type": "PostalAddress", addressLocality: p.city } } : {}),
                ...(p.rating != null
                  ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.review_count } }
                  : {}),
              },
            })),
          },
        },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen bg-canvas grid place-items-center px-6 text-center pb-24">
      <div>
        <h1 className="text-xl font-black tracking-tight">Service not found</h1>
        <p className="mt-2 text-sm text-brand/60">That service category doesn't exist.</p>
        <Link to="/" className="mt-4 inline-block text-accent font-bold text-sm underline underline-offset-2">
          Browse all services
        </Link>
      </div>
      <BottomNav />
    </div>
  ),
  component: CategoryPage,
});

function CategoryPage() {
  const navigate = useNavigate();
  const { category, initialProviders, categories } = Route.useLoaderData();

  const { data: providers = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["providers", category.id],
    initialData: initialProviders,
    queryFn: () => fetchActiveProviders(category.id),
  });

  // Shared location — whatever the customer already set on the homepage
  // (device GPS or a typed city/ZIP) carries over here automatically, with
  // a silent background geolocation attempt as a fallback if nothing's set.
  const [coords] = useUserLocation();

  const sortedProviders = useMemo(() => {
    const list = providers as unknown as (ProviderCardData & { latitude: number | null; longitude: number | null })[];
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
  }, [providers, coords]);

  return (
    <div className="min-h-screen bg-canvas font-sans text-brand pb-28 lg:pb-12">
      <AppTopBar />

      <div className="mx-auto max-w-[1240px] lg:px-6 lg:pt-6">
        <header className="relative overflow-hidden bg-[#0b1730] px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-6 text-white lg:rounded-2xl lg:p-8">
          <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-accent/25 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              aria-label="Back"
              className="grid size-10 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 transition hover:bg-white/20"
            >
              <ArrowLeft className="size-5" />
            </button>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Fixrly services</span>
          </div>
          <div className="relative mt-5 flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white shadow-lg lg:size-16">
              <CategoryIcon slug={category.slug} emoji={category.icon} className="size-7 text-3xl lg:size-8" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">{category.name} near you</h1>
              <p className="mt-1 max-w-2xl text-sm text-white/75">
                Compare vetted {category.name.toLowerCase()} providers near you, check ratings and pricing, and book directly on Fixrly — no
                phone calls needed.
              </p>
            </div>
          </div>
        </header>

        {categories.length > 1 && (
          <nav aria-label="Service categories" className="flex gap-2 overflow-x-auto px-4 py-4 no-scrollbar lg:px-0">
            {categories.map((c) => {
              const active = c.id === category.id;
              return (
                <Link
                  key={c.id}
                  to="/services/$categorySlug"
                  params={{ categorySlug: c.slug }}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-none items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    active ? "border-accent bg-accent text-white shadow-md shadow-accent/25" : "border-soft bg-surface hover:border-accent/30"
                  }`}
                >
                  <CategoryIcon slug={c.slug} emoji={c.icon} className={`size-4 text-base ${active ? "text-white" : ""}`} />
                  {c.name}
                </Link>
              );
            })}
          </nav>
        )}

        <section className="px-4 pb-8 lg:px-0" aria-labelledby="results">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="results" className="text-lg font-bold">
              Top {category.name.toLowerCase()} pros
            </h2>
            <span className="text-xs font-semibold text-brand/50">
              {sortedProviders.length} {sortedProviders.length === 1 ? "result" : "results"}
            </span>
          </div>

          {isLoading ? (
            <InlineSpinner />
          ) : isError ? (
            <ErrorState description="Couldn't load providers." onRetry={() => refetch()} />
          ) : sortedProviders.length === 0 ? (
            <EmptyState
              icon={Compass}
              title={`No ${category.name.toLowerCase()} pros yet`}
              description="Check back soon, or browse all services instead."
              action={
                <Link to="/" className="text-accent font-bold text-sm underline underline-offset-2">
                  Browse all services
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedProviders.map((p) => (
                <ProviderCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
