import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { GoogleMap } from "@/components/GoogleMap";
import { BottomNav } from "@/components/BottomNav";
import { ArrowLeft, Star, MapPin, Phone, Mail, Heart, Users, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { getOrCreateConversation } from "@/lib/chat";
import { formatMoney, useCurrency } from "@/lib/currency";
import { Panel, Eyebrow, PrimaryButton, PageSpinner } from "@/components/ui-kit";

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
    const url = `https://fixrly.app/provider/${params.id}`;
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

function ProviderPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const currency = useCurrency();

  const { data, isLoading } = useQuery({
    queryKey: ["provider", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_profiles")
        .select("*, provider_categories(service_categories(id,name,icon))")
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
      navigate({ to: "/messages" });
      toast.success("Opened chat");
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("selectedConversationId", conversationId);
      }
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

  const [chatLoading, setChatLoading] = useState(false);

  if (isLoading) {
    return <PageSpinner />;
  }
  if (!data) {
    return <div className="min-h-screen grid place-items-center text-sm text-brand/60">Provider not found.</div>;
  }

  const rating = reviews.length ? reviews.reduce((a, b) => a + b.rating, 0) / reviews.length : null;
  const categories = (data.provider_categories ?? []).map((pc: any) => pc.service_categories).filter(Boolean);

  return (
    <div className="min-h-screen bg-canvas pb-32">
      <div className="max-w-lg mx-auto">
      <div className="relative h-64 bg-gradient-to-br from-accent/80 to-[#0f172a] overflow-hidden">
        {data.photo_urls?.[0] ? (
          <img src={data.photo_urls[0]} alt={data.business_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-white/70 font-black text-6xl">
            {data.business_name?.[0]}
          </div>
        )}
        <button
          onClick={() => navigate({ to: "/" })}
          className="absolute top-5 left-4 size-10 rounded-2xl bg-white/20 backdrop-blur-md grid place-items-center text-white shadow-lg"
        >
          <ArrowLeft className="size-4" />
        </button>
      </div>

      <div className="px-4 -mt-9 relative space-y-4">
        <Panel className="rounded-[2rem] p-5">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-black tracking-tight truncate">{data.business_name}</h1>
              {data.city && <div className="text-xs text-brand/60 flex items-center gap-1 mt-1"><MapPin className="size-3" />{data.city}</div>}
            </div>
            <div className="flex flex-col items-center gap-0.5 rounded-2xl bg-accent/10 px-3 py-2 shrink-0">
              <div className="flex items-center gap-1">
                <Star className="size-3.5 fill-yellow-500 text-yellow-500" />
                <span className="font-bold text-sm">{rating ? rating.toFixed(1) : "New"}</span>
              </div>
              <span className="font-mono text-[9px] font-bold uppercase text-brand/40">{reviews.length} reviews</span>
            </div>
          </div>

          <div className="flex gap-2 mt-4 flex-wrap">
            {categories.map((c: any) => (
              <span key={c.id} className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-xl bg-brand/5">
                {c.icon} {c.name}
              </span>
            ))}
          </div>

          {data.hourly_rate != null && (
            <div className="mt-4 pt-4 border-t border-soft flex items-center justify-between">
              <div>
                <Eyebrow>Rate</Eyebrow>
                <div className="mt-1 font-mono font-bold text-lg text-accent">{formatMoney(data.hourly_rate, currency)}<span className="text-xs text-brand/60">/hr</span></div>
              </div>
              {data.availability_note && (
                <div className="text-right">
                  <Eyebrow>Availability</Eyebrow>
                  <div className="mt-1 text-xs font-semibold text-green-600">{data.availability_note}</div>
                </div>
              )}
            </div>
          )}
        </Panel>

        {data.bio && (
          <Panel className="rounded-[1.75rem] p-5">
            <Eyebrow className="mb-1.5">About</Eyebrow>
            <p className="text-sm leading-relaxed text-brand/80">{data.bio}</p>
          </Panel>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={openChat}
            disabled={chatLoading}
            className="light-surface flex min-w-[100px] flex-1 basis-[30%] flex-col items-center gap-2 rounded-2xl bg-white p-3.5 shadow-soft transition disabled:opacity-60"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><MessageSquare className="size-4" /></span>
            <span className="text-xs font-bold text-brand">{chatLoading ? "Opening…" : "Chat"}</span>
          </button>
          {data.phone && (
            <a href={`tel:${data.phone}`} className="light-surface flex min-w-[100px] flex-1 basis-[30%] flex-col items-center gap-2 rounded-2xl bg-white p-3.5 shadow-soft transition">
              <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><Phone className="size-4" /></span>
              <span className="text-xs font-bold text-brand">Call</span>
            </a>
          )}
          {(data.profiles as any)?.full_name && (
            <div className="light-surface flex min-w-[100px] flex-1 basis-[30%] flex-col items-center gap-2 rounded-2xl bg-white p-3.5 shadow-soft">
              <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><Mail className="size-4" /></span>
              <span className="w-full truncate text-center text-xs font-bold text-brand">{(data.profiles as any).full_name}</span>
            </div>
          )}
        </div>

        {data.latitude && data.longitude && (
          <div className="h-40 rounded-[1.75rem] overflow-hidden shadow-soft">
            <GoogleMap
              center={{ lat: data.latitude, lng: data.longitude }}
              markers={[{ lat: data.latitude, lng: data.longitude, id: data.id }]}
              zoom={13}
            />
          </div>
        )}

        <Panel className="flex items-center justify-between rounded-[1.75rem] p-5">
          <Eyebrow>Reactions</Eyebrow>
          <div className="flex gap-2">
            <button
              onClick={() => react("like")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                reactions?.mine === "like"
                  ? "bg-green-600 text-white"
                  : "bg-brand/5 text-brand hover:bg-green-50 hover:text-green-700"
              }`}
            >
              <ThumbsUp className={`size-4 ${reactions?.mine === "like" ? "fill-white" : ""}`} />
              {reactions?.likes ?? 0}
            </button>
            <button
              onClick={() => react("dislike")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                reactions?.mine === "dislike"
                  ? "bg-red-600 text-white"
                  : "bg-brand/5 text-brand hover:bg-red-50 hover:text-red-700"
              }`}
            >
              <ThumbsDown className={`size-4 ${reactions?.mine === "dislike" ? "fill-white" : ""}`} />
              {reactions?.dislikes ?? 0}
            </button>
          </div>
        </Panel>

        <div className="pt-2">
          <h2 className="font-black text-lg mb-3 tracking-tight">Reviews</h2>
          {reviews.length === 0 ? (
            <p className="text-sm text-brand/50">No reviews yet.</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <Panel key={r.id} className="rounded-[1.5rem] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{r.profiles?.full_name ?? "Customer"}</div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`size-3 ${i < r.rating ? "fill-yellow-500 text-yellow-500" : "text-brand/20"}`} />
                      ))}
                    </div>
                  </div>
                  {r.comment && <p className="text-sm mt-1 text-brand/80">{r.comment}</p>}
                </Panel>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>

      <div className="light-surface fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-soft p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="max-w-lg mx-auto flex gap-2 items-center">
          <button
            onClick={toggleFollow}
            className={`flex h-12 shrink-0 items-center gap-1.5 rounded-2xl px-4 text-xs font-bold transition ${
              followData?.following ? "bg-[#0f172a] text-white" : "bg-brand/5 text-brand hover:bg-brand/10"
            }`}
          >
            <Heart className={`size-4 ${followData?.following ? "fill-white" : ""}`} />
            {followData?.following ? "Following" : "Follow"}
            {followData && followData.count > 0 && (
              <span className="ml-1 text-[10px] opacity-70 flex items-center gap-0.5">
                <Users className="size-3" /> {followData.count}
              </span>
            )}
          </button>
          <PrimaryButton
            onClick={() => {
              if (!user) return navigate({ to: "/auth", search: { redirect: `/book/${id}` } });
              navigate({ to: "/book/$id", params: { id } });
            }}
            className="flex-1 h-12 rounded-2xl py-0 text-sm"
          >
            Book now
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
