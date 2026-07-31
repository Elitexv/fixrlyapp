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
import { Panel, Tile, Eyebrow, PrimaryButton, SecondaryButton, PageSpinner } from "@/components/ui-kit";

export const Route = createFileRoute("/provider/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Provider profile — Nearby` },
      { name: "description", content: `Book this service provider on Nearby.` },
    ],
  }),
  component: ProviderPage,
});

function ProviderPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useSession();

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
    <div className="min-h-screen bg-canvas pb-32 lg:pl-72">
      <div className="relative h-56 bg-brand/10">
        {data.photo_urls?.[0] ? (
          <img src={data.photo_urls[0]} alt={data.business_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-brand/30 font-black text-6xl">
            {data.business_name?.[0]}
          </div>
        )}
        <button
          onClick={() => navigate({ to: "/" })}
          className="light-surface absolute top-4 left-4 size-10 rounded-full bg-white/90 backdrop-blur grid place-items-center shadow-lg"
        >
          <ArrowLeft className="size-4" />
        </button>
      </div>

      <div className="px-4 -mt-6 relative space-y-4">
        <Panel className="p-5">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-black tracking-tight truncate">{data.business_name}</h1>
              {data.city && <div className="text-xs text-brand/60 flex items-center gap-1 mt-1"><MapPin className="size-3" />{data.city}</div>}
            </div>
            <div className="flex items-center gap-1 bg-brand/5 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0">
              <Star className="size-3.5 fill-yellow-500 text-yellow-500" />
              {rating ? rating.toFixed(1) : "New"}
              <span className="text-brand/40">({reviews.length})</span>
            </div>
          </div>

          <div className="flex gap-2 mt-3 flex-wrap">
            {categories.map((c: any) => (
              <span key={c.id} className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-brand/5">
                {c.icon} {c.name}
              </span>
            ))}
          </div>

          {data.hourly_rate != null && (
            <div className="mt-4 pt-4 border-t border-brand/5 flex items-center justify-between">
              <div>
                <Eyebrow>Rate</Eyebrow>
                <div className="mt-1 font-mono font-bold text-lg text-accent">₦{Number(data.hourly_rate).toFixed(0)}<span className="text-xs text-brand/60">/hr</span></div>
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
          <Tile className="hover:shadow-sm">
            <Eyebrow className="mb-1.5">About</Eyebrow>
            <p className="text-sm leading-relaxed">{data.bio}</p>
          </Tile>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <Tile as="button" onClick={openChat} disabled={chatLoading} className="flex items-center gap-2 font-semibold hover:shadow-sm disabled:opacity-60">
            <MessageSquare className="size-4 text-accent" /> {chatLoading ? "Opening…" : "Chat"}
          </Tile>
          {data.phone && (
            <Tile as="a" href={`tel:${data.phone}`} className="flex items-center gap-2 font-semibold hover:shadow-sm">
              <Phone className="size-4 text-accent" /> Call
            </Tile>
          )}
          {(data.profiles as any)?.full_name && (
            <Tile className="flex items-center gap-2 font-semibold truncate hover:shadow-sm">
              <Mail className="size-4 text-accent" /> {(data.profiles as any).full_name}
            </Tile>
          )}
        </div>

        {data.latitude && data.longitude && (
          <div className="h-40 rounded-2xl overflow-hidden border border-brand/10 shadow-sm">
            <GoogleMap
              center={{ lat: data.latitude, lng: data.longitude }}
              markers={[{ lat: data.latitude, lng: data.longitude, id: data.id }]}
              zoom={13}
            />
          </div>
        )}

        <Tile className="flex items-center justify-between hover:shadow-sm">
          <Eyebrow>Reactions</Eyebrow>
          <div className="flex gap-2">
            <button
              onClick={() => react("like")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                reactions?.mine === "like"
                  ? "bg-green-600 text-white border-green-600"
                  : "light-surface bg-white border-brand/10 text-brand hover:border-green-500"
              }`}
            >
              <ThumbsUp className={`size-4 ${reactions?.mine === "like" ? "fill-white" : ""}`} />
              {reactions?.likes ?? 0}
            </button>
            <button
              onClick={() => react("dislike")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                reactions?.mine === "dislike"
                  ? "bg-red-600 text-white border-red-600"
                  : "light-surface bg-white border-brand/10 text-brand hover:border-red-500"
              }`}
            >
              <ThumbsDown className={`size-4 ${reactions?.mine === "dislike" ? "fill-white" : ""}`} />
              {reactions?.dislikes ?? 0}
            </button>
          </div>
        </Tile>

        <div className="pt-2">
          <h2 className="font-bold text-lg mb-3">Reviews</h2>
          {reviews.length === 0 ? (
            <p className="text-sm text-brand/50">No reviews yet.</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <Tile key={r.id} className="hover:shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{r.profiles?.full_name ?? "Customer"}</div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`size-3 ${i < r.rating ? "fill-yellow-500 text-yellow-500" : "text-brand/20"}`} />
                      ))}
                    </div>
                  </div>
                  {r.comment && <p className="text-sm mt-1 text-brand/80">{r.comment}</p>}
                </Tile>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="light-surface fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-border p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="max-w-lg mx-auto flex gap-2 items-center">
          <SecondaryButton
            onClick={toggleFollow}
            className={`h-12 px-4 py-0 text-xs gap-1.5 ${followData?.following ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90" : ""}`}
          >
            <Heart className={`size-4 ${followData?.following ? "fill-white" : ""}`} />
            {followData?.following ? "Following" : "Follow"}
            {followData && followData.count > 0 && (
              <span className="ml-1 text-[10px] opacity-70 flex items-center gap-0.5">
                <Users className="size-3" /> {followData.count}
              </span>
            )}
          </SecondaryButton>
          <PrimaryButton
            onClick={() => {
              if (!user) return navigate({ to: "/auth", search: { redirect: `/book/${id}` } });
              navigate({ to: "/book/$id", params: { id } });
            }}
            className="flex-1 h-12 py-0 text-sm"
          >
            Book now
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
