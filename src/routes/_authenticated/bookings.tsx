import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { firebaseAuth } from "@/integrations/firebase/client";
import { BottomNav } from "@/components/BottomNav";
import { useSession, useRoles } from "@/lib/session";
import { toast } from "sonner";
import { Star, CalendarCheck, CalendarDays, Loader2, MapPin, Navigation, ReceiptText } from "lucide-react";
import { getPaymentStatusBadge, getPaymentStatusLabel } from "@/lib/booking-payment";
import { formatMoney, useCurrency } from "@/lib/currency";
import { initializePaystackPayment, verifyPaystackPayment } from "@/lib/payments.functions";
import { getOrCreateConversation, sendChatMessage } from "@/lib/chat";
import { getCurrentPosition, startLocationSharing } from "@/lib/provider-tracking";
import { formatRelativeTime } from "@/lib/time";
import { ProviderTrackingMap } from "@/components/ProviderTrackingMap";
import { Panel, StatusBadge, InlineSpinner, EmptyState, ErrorState, PrimaryButton, SecondaryButton } from "@/components/ui-kit";
import { AppTopBar } from "@/components/AppTopBar";
import { CategoryIcon } from "@/components/CategoryVisual";

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

  const { data: bookings = [], isLoading: queryLoading, isError, refetch } = useQuery({
    queryKey: ["bookings", user?.id, tab],
    enabled: !!user && !rolesLoading,
    queryFn: async () => {
      const col = tab === "customer" ? "customer_id" : "provider_id";
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "*, provider:provider_profiles!bookings_provider_id_fkey(id,business_name), customer:profiles!bookings_customer_id_profiles_fkey(full_name), category:service_categories(name,icon,slug)",
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

  const FILTERS = [
    { k: "all", label: "All" },
    { k: "hired", label: "Hired & paid" },
    { k: "pending", label: "Pending" },
    { k: "accepted", label: "Accepted" },
    { k: "on_the_way", label: "On the way" },
    { k: "completed", label: "Completed" },
    { k: "rejected", label: "Rejected" },
    { k: "cancelled", label: "Cancelled" },
    { k: "failed", label: "Failed" },
  ] as const;

  return (
    <div className="min-h-screen bg-canvas pb-28 text-brand lg:pb-12">
      <AppTopBar />

      <div className="mx-auto max-w-[1240px] lg:px-6 lg:pt-6">
        <header className="relative overflow-hidden bg-[#0b1730] px-4 pt-[max(env(safe-area-inset-top),1.25rem)] pb-5 text-white lg:rounded-2xl lg:p-7">
          <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-accent/25 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Bookings</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight lg:text-3xl">My bookings</h1>
              <p className="mt-1 text-sm text-white/70">
                {tab === "customer" ? "Services you've booked, and where they're at." : "Jobs customers have booked with you."}
              </p>
            </div>
            {isProvider && (
              <div className="flex w-full gap-1 rounded-xl bg-white/10 p-1 ring-1 ring-white/15 sm:w-auto" role="tablist" aria-label="Booking side">
                {(["customer", "provider"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${
                      tab === t ? "bg-white text-[#0b1730] shadow" : "text-white/75 hover:text-white"
                    }`}
                  >
                    As {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        <nav aria-label="Filter bookings" className="flex gap-2 overflow-x-auto px-4 py-4 no-scrollbar lg:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.k}
              type="button"
              onClick={() => setFilter(f.k)}
              aria-pressed={filter === f.k}
              className={`flex-none rounded-full border px-4 py-2 text-sm font-medium transition ${
                filter === f.k ? "border-accent bg-accent text-white shadow-md shadow-accent/25" : "border-soft bg-surface text-brand/70 hover:border-accent/30"
              }`}
            >
              {f.label}
            </button>
          ))}
        </nav>

        <div className="grid grid-cols-1 items-start gap-4 px-4 pb-6 lg:grid-cols-2 lg:px-0">
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
            if (isLoading) return <InlineSpinner className="lg:col-span-2" />;
            if (isError)
              return (
                <div className="lg:col-span-2">
                  <ErrorState description="Couldn't load bookings." onRetry={() => refetch()} />
                </div>
              );
            if (visible.length === 0)
              return (
                <div className="lg:col-span-2">
                  <EmptyState icon={CalendarCheck} title="No bookings in this view" description="Bookings you make or receive will show up here." />
                </div>
              );
            return visible.map((b) => (
              <Panel key={b.id} as="article" className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-orange-50 dark:bg-orange-500/10">
                    <CategoryIcon slug={b.category?.slug ?? ""} emoji={b.category?.icon ?? null} className="size-5 text-lg" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-bold">
                          {tab === "customer" ? b.provider?.business_name : (b.customer?.full_name ?? "Customer")}
                        </div>
                        <div className="truncate text-xs text-brand/55">
                          {b.category?.name ?? "Service"}
                          {b.booking_number && <span className="text-brand/40"> · #{b.booking_number}</span>}
                        </div>
                      </div>
                      <StatusBadge status={b.status} />
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-brand/60">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="size-3.5 shrink-0" />
                        {new Date(b.scheduled_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        <span className="text-brand/35">· booked {formatRelativeTime(b.created_at)}</span>
                      </div>
                      {b.address && (
                        <div className="flex items-start gap-1.5">
                          <MapPin className="mt-px size-3.5 shrink-0" />
                          <span>{b.address}</span>
                        </div>
                      )}
                    </div>
                    {b.notes && <div className="mt-2.5 rounded-xl bg-canvas p-2.5 text-xs text-brand/75">{b.notes}</div>}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-lg font-extrabold">{b.total_price ? formatMoney(b.total_price, currency) : "—"}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getPaymentStatusBadge(b.payment_status)}`}>
                        {getPaymentStatusLabel(b.payment_status)}
                      </span>
                    </div>
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

                <div className="mt-4 flex flex-wrap gap-2 border-t border-soft pt-4">
                  {tab === "customer" && b.payment_status === "pending" && b.payment_provider === "paystack" && (
                    <PrimaryButton onClick={() => payNow(b.id)} loading={payingId === b.id} className="flex-1 py-2.5 text-xs">
                      Pay now
                    </PrimaryButton>
                  )}
                  {tab === "provider" && b.status === "pending" && (
                    <>
                      <PrimaryButton onClick={() => updateStatus(b.id, "accepted")} className="flex-1 py-2.5 text-xs">Accept</PrimaryButton>
                      <SecondaryButton onClick={() => updateStatus(b.id, "rejected")} className="flex-1 py-2.5 text-xs">Reject</SecondaryButton>
                    </>
                  )}
                  {tab === "provider" && b.status === "accepted" && (
                    <>
                      <PrimaryButton onClick={() => startOnTheWay(b)} disabled={startingOtwId === b.id} className="flex-1 py-2.5 text-xs">
                        {startingOtwId === b.id ? <Loader2 className="size-3.5 animate-spin" /> : <Navigation className="size-3.5" />}
                        I'm on my way
                      </PrimaryButton>
                      <SecondaryButton onClick={() => updateStatus(b.id, "completed")} className="flex-1 py-2.5 text-xs">Mark completed</SecondaryButton>
                    </>
                  )}
                  {tab === "provider" && b.status === "on_the_way" && (
                    <>
                      <div className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-50 py-2.5 text-center text-xs font-semibold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                        <Navigation className="size-3.5 animate-pulse" /> Sharing live location
                      </div>
                      <PrimaryButton onClick={() => updateStatus(b.id, "completed")} className="flex-1 py-2.5 text-xs">Mark completed</PrimaryButton>
                    </>
                  )}
                  {tab === "customer" && ["pending", "accepted", "on_the_way"].includes(b.status) && (
                    <SecondaryButton onClick={() => updateStatus(b.id, "cancelled")} className="flex-1 py-2.5 text-xs">Cancel</SecondaryButton>
                  )}
                  {b.provider?.id && (
                    <SecondaryButton onClick={() => navigate({ to: "/provider/$id", params: { id: b.provider.id } })} className="px-3 py-2.5 text-xs">
                      Provider profile
                    </SecondaryButton>
                  )}
                  {["pending", "completed"].includes(b.status) && (
                    <SecondaryButton onClick={() => navigate({ to: "/bookings/$id/receipt", params: { id: b.id } })} className="px-3 py-2.5 text-xs">
                      <ReceiptText className="size-3.5" /> Receipt
                    </SecondaryButton>
                  )}
                  {tab === "customer" && b.status === "completed" && <LeaveReviewButton booking={b} />}
                </div>
              </Panel>
            ));
          })()}
        </div>
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
      <PrimaryButton onClick={() => setOpen(true)} className="flex-1 py-2.5 text-xs"><Star className="size-3.5" /> Leave review</PrimaryButton>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Rate this provider" className="fixed inset-0 z-50 bg-black/50 grid place-items-center px-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-soft bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-bold">Rate this provider</h3>
            <div className="flex justify-center gap-1 my-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={n <= rating}>
                  <Star className={`size-8 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-brand/20"}`} />
                </button>
              ))}
            </div>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment" aria-label="Review comment" rows={3} className="w-full resize-none rounded-xl border border-soft bg-canvas px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10" />
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
