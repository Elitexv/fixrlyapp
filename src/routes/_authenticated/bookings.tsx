import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { firebaseAuth } from "@/integrations/firebase/client";
import { BottomNav } from "@/components/BottomNav";
import { useSession, useRoles } from "@/lib/session";
import { toast } from "sonner";
import { Star, CalendarCheck, Loader2, Navigation } from "lucide-react";
import { getPaymentStatusBadge, getPaymentStatusLabel } from "@/lib/booking-payment";
import { formatMoney, useCurrency } from "@/lib/currency";
import { initializePaystackPayment, verifyPaystackPayment } from "@/lib/payments.functions";
import { getOrCreateConversation, sendChatMessage } from "@/lib/chat";
import { getCurrentPosition, startLocationSharing } from "@/lib/provider-tracking";
import { formatRelativeTime } from "@/lib/time";
import { ProviderTrackingMap } from "@/components/ProviderTrackingMap";
import { StickyHeader, Tile, StatusBadge, InlineSpinner, EmptyState, PrimaryButton, SecondaryButton } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/bookings")({
  head: () => ({ meta: [{ title: "My bookings — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: BookingsPage,
});

function BookingsPage() {
  const { user } = useSession();
  const { data: roles = [], isLoading: rolesLoading } = useRoles(user);
  const isProvider = roles.includes("provider");
  const currency = useCurrency();
  const [tab, setTab] = useState<"customer" | "provider">("customer");
  const [filter, setFilter] = useState<"all" | "hired" | "pending" | "accepted" | "on_the_way" | "completed" | "rejected" | "cancelled" | "failed">("all");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const initializePayment = useServerFn(initializePaystackPayment);
  const verifyPayment = useServerFn(verifyPaystackPayment);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [startingOtwId, setStartingOtwId] = useState<string | null>(null);
  const verifiedRef = useRef<string | null>(null);
  const trackingStopRef = useRef<(() => void) | null>(null);
  const trackingBookingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || rolesLoading) return;
    setTab(isProvider ? "provider" : "customer");
  }, [user, isProvider, rolesLoading]);

  const { data: bookings = [], isLoading: queryLoading } = useQuery({
    queryKey: ["bookings", user?.id, tab],
    enabled: !!user && !rolesLoading,
    queryFn: async () => {
      const col = tab === "customer" ? "customer_id" : "provider_id";
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "*, provider:provider_profiles!bookings_provider_id_fkey(id,business_name), customer:profiles!bookings_customer_id_profiles_fkey(full_name), category:service_categories(name,icon)",
        )
        .eq(col, user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const isLoading = rolesLoading || queryLoading;

  // Paystack redirects the customer back here with ?paystack_ref=... after checkout;
  // verify it server-side rather than trusting the redirect itself as proof of payment.
  useEffect(() => {
    if (!user) return;
    const reference = new URLSearchParams(window.location.search).get("paystack_ref");
    if (!reference || verifiedRef.current === reference) return;
    verifiedRef.current = reference;
    (async () => {
      try {
        const result = await verifyPayment({ data: { reference } });
        if (result.status === "paid") {
          toast.success("Payment confirmed!");
          // Hand back the full payment + booking details rather than just a toast.
          navigate({ to: "/bookings/$id/receipt", params: { id: result.bookingId } });
          return;
        }
        toast.error("Payment not completed — booking is still pending. Tap \"Pay now\" to try again.");
      } catch (err: any) {
        toast.error(err.message ?? "Could not verify payment");
      } finally {
        const url = new URL(window.location.href);
        url.searchParams.delete("paystack_ref");
        window.history.replaceState({}, "", url.toString());
        qc.invalidateQueries({ queryKey: ["bookings", user.id, "customer"] });
      }
    })();
  }, [user, verifyPayment, qc, navigate]);

  const updateStatus = async (id: string, status: "pending" | "accepted" | "rejected" | "completed" | "cancelled") => {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Booking ${status}`);
    qc.invalidateQueries({ queryKey: ["bookings", user?.id, tab] });
  };

  // Resumes/stops the live-location watch to match whichever booking (if
  // any) is currently on_the_way for this provider — so a page reload while
  // en route just picks tracking back up instead of leaving the customer's
  // map stale.
  useEffect(() => {
    if (tab !== "provider") return;
    const active = bookings.find((b: any) => b.status === "on_the_way");
    if (!active) {
      trackingStopRef.current?.();
      trackingStopRef.current = null;
      trackingBookingIdRef.current = null;
      return;
    }
    if (trackingBookingIdRef.current === active.id) return;
    trackingStopRef.current?.();
    trackingBookingIdRef.current = active.id;
    trackingStopRef.current = startLocationSharing(active.id, (msg) => toast.error(msg));
  }, [bookings, tab]);

  useEffect(() => () => trackingStopRef.current?.(), []);

  // The customer's booking list is a plain react-query fetch, not
  // live — without this, the "on the way" pin would only move on manual
  // refresh instead of tracking the provider in real time.
  useEffect(() => {
    if (!user || tab !== "customer") return;
    const channel = supabase
      .channel(`bookings-live:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `customer_id=eq.${user.id}` },
        (payload) => {
          qc.setQueryData(["bookings", user.id, "customer"], (old: any[] = []) =>
            old.map((b) => (b.id === payload.new.id ? { ...b, ...payload.new } : b)),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, tab, qc]);

  const startOnTheWay = async (booking: any) => {
    if (!user) return;
    setStartingOtwId(booking.id);
    try {
      const pos = await getCurrentPosition();
      const { error } = await supabase
        .from("bookings")
        .update({
          status: "on_the_way",
          provider_lat: pos.coords.latitude,
          provider_lng: pos.coords.longitude,
          provider_location_updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id);
      if (error) throw error;

      // Best-effort: a customer chat message is a nice touch, not the point
      // of the feature — a failure here shouldn't undo the status change.
      try {
        const conversationId = await getOrCreateConversation(user.id, booking.customer_id);
        await sendChatMessage(conversationId, user.id, "provider", "🚗 I'm on my way!");
      } catch (chatErr) {
        console.warn("[bookings] on-the-way chat message failed", chatErr);
      }

      toast.success("Customer notified — you're on the way!");
      qc.invalidateQueries({ queryKey: ["bookings", user.id, "provider"] });
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't start sharing your location");
    } finally {
      setStartingOtwId(null);
    }
  };

  const payNow = async (id: string) => {
    setPayingId(id);
    try {
      const result = await initializePayment({ data: { bookingId: id } });
      window.location.href = result.authorizationUrl;
    } catch (err: any) {
      toast.error(err.message ?? "Could not start payment");
      setPayingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-canvas pb-24">
      <StickyHeader className="pb-3">
        <h1 className="text-xl font-black tracking-tight">My bookings</h1>
        {isProvider && (
          <div className="mt-3 flex gap-2 bg-canvas rounded-xl p-1">
            <button
              onClick={() => setTab("customer")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${tab === "customer" ? "light-surface bg-white shadow-sm text-brand" : "text-brand/50 hover:text-brand/70"}`}
            >
              As customer
            </button>
            <button
              onClick={() => setTab("provider")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${tab === "provider" ? "light-surface bg-white shadow-sm text-brand" : "text-brand/50 hover:text-brand/70"}`}
            >
              As provider
            </button>
          </div>
        )}
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {([
            { k: "all", label: "All" },
            { k: "hired", label: "Hired & paid" },
            { k: "pending", label: "Pending" },
            { k: "accepted", label: "Accepted" },
            { k: "on_the_way", label: "On the way" },
            { k: "completed", label: "Completed" },
            { k: "rejected", label: "Rejected" },
            { k: "cancelled", label: "Cancelled" },
            { k: "failed", label: "Failed" },
          ] as const).map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={`flex-none px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition ${filter === f.k ? "bg-accent text-white shadow-lg shadow-accent/20" : "bg-canvas text-brand/60 border border-brand/5 hover:border-accent/20"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </StickyHeader>

      <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
        {(() => {
          const visible = bookings.filter((b) => {
            if (filter === "all") return true;
            if (filter === "hired") return ["accepted", "on_the_way", "completed"].includes(b.status) || b.payment_status === "paid";
            if (filter === "pending") return b.status === "pending" || b.payment_status === "pending" || (b.payment_status === "not_required" && b.status === "pending");
            if (filter === "accepted") return b.status === "accepted";
            if (filter === "on_the_way") return b.status === "on_the_way";
            if (filter === "completed") return b.status === "completed";
            if (filter === "rejected") return b.status === "rejected";
            if (filter === "cancelled") return b.status === "cancelled";
            if (filter === "failed") return b.payment_status === "failed" || b.status === "rejected" || b.status === "cancelled";
            return true;
          });
          if (isLoading) return <InlineSpinner />;
          if (visible.length === 0)
            return <EmptyState icon={CalendarCheck} title="No bookings in this view" description="Bookings you make or receive will show up here." />;
          return visible.map((b) => (
            <Tile key={b.id}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-brand/40">
                    <span>{b.category?.icon} {b.category?.name}</span>
                    {b.booking_number && <span className="font-mono normal-case text-brand/30">· {b.booking_number}</span>}
                  </div>
                  <div className="font-bold truncate">
                    {tab === "customer" ? b.provider?.business_name : (b.customer?.full_name ?? "Customer")}
                  </div>
                  <div className="text-xs text-brand/60 mt-0.5">{new Date(b.scheduled_at).toLocaleString()}</div>
                  <div className="text-[10px] text-brand/40 mt-0.5">Booked {formatRelativeTime(b.created_at)}</div>
                  <div className="text-xs text-brand/60 mt-1">{b.address}</div>
                  {b.notes && <div className="text-xs mt-2 p-2 bg-canvas rounded-lg">{b.notes}</div>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusBadge status={b.status} />
                  {b.total_price && <span className="font-mono font-bold text-sm text-accent">{formatMoney(b.total_price, currency)}</span>}
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${getPaymentStatusBadge(b.payment_status)}`}>{getPaymentStatusLabel(b.payment_status)}</span>
                </div>
              </div>

              {tab === "customer" && b.status === "on_the_way" && b.provider_lat != null && b.provider_lng != null && (
                <ProviderTrackingMap
                  providerLat={b.provider_lat}
                  providerLng={b.provider_lng}
                  destLat={b.dest_lat}
                  destLng={b.dest_lng}
                  updatedAt={b.provider_location_updated_at}
                />
              )}

              <div className="mt-3 pt-3 border-t border-brand/5 flex gap-2 flex-wrap">
                {tab === "customer" && b.payment_status === "pending" && b.payment_provider === "paystack" && (
                  <button
                    onClick={() => payNow(b.id)}
                    disabled={payingId === b.id}
                    className="flex-1 py-2 bg-accent text-white rounded-lg text-xs font-bold transition hover:bg-orange-500 disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
                  >
                    {payingId === b.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Pay now
                  </button>
                )}
                {tab === "provider" && b.status === "pending" && (
                  <>
                    <PrimaryButton onClick={() => updateStatus(b.id, "accepted")} className="flex-1 py-2 rounded-lg text-xs">Accept</PrimaryButton>
                    <SecondaryButton onClick={() => updateStatus(b.id, "rejected")} className="flex-1 py-2 rounded-lg text-xs">Reject</SecondaryButton>
                  </>
                )}
                {tab === "provider" && b.status === "accepted" && (
                  <>
                    <PrimaryButton
                      onClick={() => startOnTheWay(b)}
                      disabled={startingOtwId === b.id}
                      className="flex-1 py-2 rounded-lg text-xs inline-flex items-center justify-center gap-1.5"
                    >
                      {startingOtwId === b.id ? <Loader2 className="size-3.5 animate-spin" /> : <Navigation className="size-3.5" />}
                      I'm on my way
                    </PrimaryButton>
                    <SecondaryButton onClick={() => updateStatus(b.id, "completed")} className="flex-1 py-2 rounded-lg text-xs">Mark completed</SecondaryButton>
                  </>
                )}
                {tab === "provider" && b.status === "on_the_way" && (
                  <>
                    <div className="flex-1 py-2 rounded-lg text-xs font-bold text-center bg-orange-50 text-orange-700 inline-flex items-center justify-center gap-1.5">
                      <Navigation className="size-3.5 animate-pulse" /> Sharing live location
                    </div>
                    <PrimaryButton onClick={() => updateStatus(b.id, "completed")} className="flex-1 py-2 rounded-lg text-xs">Mark completed</PrimaryButton>
                  </>
                )}
                {tab === "customer" && ["pending", "accepted", "on_the_way"].includes(b.status) && (
                  <SecondaryButton onClick={() => updateStatus(b.id, "cancelled")} className="flex-1 py-2 rounded-lg text-xs">Cancel</SecondaryButton>
                )}
                {b.provider?.id && (
                  <SecondaryButton onClick={() => navigate({ to: "/provider/$id", params: { id: b.provider.id } })} className="py-2 px-3 rounded-xl text-xs">
                    View provider profile
                  </SecondaryButton>
                )}
                {["pending", "completed"].includes(b.status) && (
                  <SecondaryButton onClick={() => navigate({ to: "/bookings/$id/receipt", params: { id: b.id } })} className="py-2 px-3 rounded-xl text-xs">
                    Receipt
                  </SecondaryButton>
                )}
                {tab === "customer" && b.status === "completed" && (
                  <LeaveReviewButton booking={b} />
                )}
              </div>
            </Tile>
          ));
        })()}
      </div>
      <BottomNav />
    </div>
  );
}

function LeaveReviewButton({ booking }: { booking: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: existing } = useQuery({
    queryKey: ["review-for-booking", booking.id],
    queryFn: async () => {
      const { data } = await supabase.from("reviews").select("id").eq("booking_id", booking.id).maybeSingle();
      return data;
    },
  });

  if (existing) return <span className="text-xs text-brand/50">Review submitted</span>;

  const submit = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from("reviews").insert({
        booking_id: booking.id,
        customer_id: firebaseAuth.currentUser!.uid,
        provider_id: booking.provider_id,
        rating,
        comment: comment || null,
      });
      if (error) throw error;
      toast.success("Thanks for your review!");
      qc.invalidateQueries();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PrimaryButton onClick={() => setOpen(true)} className="flex-1 py-2 rounded-lg text-xs">Leave review</PrimaryButton>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center px-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="light-surface w-full max-w-sm bg-white rounded-[2rem] p-6 shadow-soft">
            <h3 className="font-black text-lg">Rate this provider</h3>
            <div className="flex justify-center gap-1 my-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)}>
                  <Star className={`size-8 ${n <= rating ? "fill-yellow-500 text-yellow-500" : "text-brand/20"}`} />
                </button>
              ))}
            </div>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment" rows={3} className="w-full bg-canvas rounded-xl py-2.5 px-3 text-sm outline-none resize-none focus:ring-2 focus:ring-accent/20" />
            <div className="flex gap-2 mt-4">
              <SecondaryButton onClick={() => setOpen(false)} className="flex-1">Cancel</SecondaryButton>
              <PrimaryButton onClick={submit} loading={loading} className="flex-1">Submit</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
