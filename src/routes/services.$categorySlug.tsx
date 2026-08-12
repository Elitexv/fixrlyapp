import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { ProviderCard } from "@/components/ProviderCard";
import { StickyHeader, InlineSpinner, EmptyState, Eyebrow } from "@/components/ui-kit";
import { fetchActiveProviders, fetchCategories, fetchCategoryBySlug } from "@/lib/providers";
import { ArrowLeft, Compass } from "lucide-react";

const SITE_URL = "https://fixrly.app";

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

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["providers", category.id],
    initialData: initialProviders,
    queryFn: () => fetchActiveProviders(category.id),
  });

  return (
    <div className="min-h-screen bg-canvas font-sans text-brand pb-24">
      <StickyHeader>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/" })}
            className="size-9 rounded-full bg-brand/5 grid place-items-center transition hover:bg-brand/10 shrink-0"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <Eyebrow>Fixrly services</Eyebrow>
            <h1 className="text-lg font-black tracking-tight truncate">
              {category.icon} {category.name} near you
            </h1>
          </div>
        </div>
      </StickyHeader>

      <div className="max-w-lg mx-auto">
        <p className="px-4 pt-4 text-sm text-brand/60">
          Compare vetted {category.name.toLowerCase()} providers near you, check ratings and pricing, and book directly on Fixrly — no
          phone calls needed.
        </p>

        {categories.length > 1 && (
          <div className="flex gap-2.5 overflow-x-auto px-4 py-4 no-scrollbar">
            {categories.map((c) => (
              <Link
                key={c.id}
                to="/services/$categorySlug"
                params={{ categorySlug: c.slug }}
                className={`flex-none px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors ${
                  c.id === category.id
                    ? "bg-accent text-white shadow-lg shadow-accent/20"
                    : "bg-surface border border-brand/5 shadow-sm text-brand/70 hover:border-accent/20"
                }`}
              >
                {c.icon} {c.name}
              </Link>
            ))}
          </div>
        )}

        <div className="px-4 pb-8 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Top {category.name.toLowerCase()} pros</h2>
            <span className="font-mono text-xs font-bold uppercase text-brand/40">{providers.length} results</span>
          </div>

          {isLoading ? (
            <InlineSpinner />
          ) : providers.length === 0 ? (
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
            providers.map((p) => <ProviderCard key={p.id} p={p} />)
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
