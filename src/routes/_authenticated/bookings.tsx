import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { useSession, useRoles } from "@/lib/session";
import { toast } from "sonner";
import { Star, CalendarCheck } from "lucide-react";
import { getPaymentStatusBadge, getPaymentStatusLabel } from "@/lib/booking-payment";
import { StickyHeader, Tile, StatusBadge, InlineSpinner, EmptyState, PrimaryButton, SecondaryButton } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/bookings")({
  head: () => ({ meta: [{ title: "My bookings — Nearby" }, { name: "robots", content: "noindex" }] }),
  component: BookingsPage,
});

function BookingsPage() {
  const { user } = useSession();
  const { data: roles = [] } = useRoles(user);
  const isProvider = roles.includes("provider");
  const [tab, setTab] = useState<"customer" | "provider">(isProvider ? "provider" : "customer");
  const [filter, setFilter] = useState<"all" | "hired" | "pending" | "completed">("all");
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["bookings", user?.id, tab],
    enabled: !!user,
    queryFn: async () => {
      const col = tab === "customer" ? "customer_id" : "provider_id";
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "*, provider:provider_profiles!bookings_provider_id_fkey(id,business_name), customer:profiles!bookings_customer_id_fkey(full_name), category:service_categories(name,icon)",
        )
        .eq(col, user!.id)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const updateStatus = async (id: string, status: "pending" | "accepted" | "rejected" | "completed" | "cancelled") => {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Booking ${status}`);
    qc.invalidateQueries({ queryKey: ["bookings", user?.id, tab] });
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
            { k: "completed", label: "Completed" },
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

      <div className="px-4 py-4 space-y-3">
        {(() => {
          const visible = bookings.filter((b) => {
            if (filter === "all") return true;
            if (filter === "hired") return ["accepted", "completed"].includes(b.status);
            if (filter === "pending") return b.status === "pending";
            if (filter === "completed") return b.status === "completed";
            return true;
          });
          if (isLoading) return <InlineSpinner />;
          if (visible.length === 0)
            return <EmptyState icon={CalendarCheck} title="No bookings in this view" description="Bookings you make or receive will show up here." />;
          return visible.map((b) => (
            <Tile key={b.id}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase text-brand/40">
                    {b.category?.icon} {b.category?.name}
                  </div>
                  <div className="font-bold truncate">
                    {tab === "customer" ? b.provider?.business_name : (b.customer?.full_name ?? "Customer")}
                  </div>
                  <div className="text-xs text-brand/60 mt-0.5">
                    {new Date(b.scheduled_at).toLocaleString()} • {b.duration_hours}h
                  </div>
                  <div className="text-xs text-brand/60 mt-1">{b.address}</div>
                  {b.notes && <div className="text-xs mt-2 p-2 bg-canvas rounded-lg">{b.notes}</div>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusBadge status={b.status} />
                  {b.total_price && <span className="font-mono font-bold text-sm text-accent">₦{Number(b.total_price).toFixed(0)}</span>}
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${getPaymentStatusBadge(b.payment_status)}`}>{getPaymentStatusLabel(b.payment_status)}</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-brand/5 flex gap-2 flex-wrap">
                {tab === "provider" && b.status === "pending" && (
                  <>
                    <PrimaryButton onClick={() => updateStatus(b.id, "accepted")} className="flex-1 py-2 rounded-lg text-xs">Accept</PrimaryButton>
                    <SecondaryButton onClick={() => updateStatus(b.id, "rejected")} className="flex-1 py-2 rounded-lg text-xs">Reject</SecondaryButton>
                  </>
                )}
                {tab === "provider" && b.status === "accepted" && (
                  <button onClick={() => updateStatus(b.id, "completed")} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold transition hover:bg-primary/90">Mark completed</button>
                )}
                {tab === "customer" && ["pending", "accepted"].includes(b.status) && (
                  <SecondaryButton onClick={() => updateStatus(b.id, "cancelled")} className="flex-1 py-2 rounded-lg text-xs">Cancel</SecondaryButton>
                )}
                {b.provider?.id && (
                  <SecondaryButton onClick={() => navigate({ to: "/provider/$id", params: { id: b.provider.id } })} className="py-2 px-3 rounded-xl text-xs">
                    View provider profile
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
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("reviews").insert({
        booking_id: booking.id,
        customer_id: u.user!.id,
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
