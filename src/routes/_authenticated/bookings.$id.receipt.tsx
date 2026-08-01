import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { formatMoney, useCurrency } from "@/lib/currency";
import { getPaymentStatusLabel } from "@/lib/booking-payment";
import { ArrowLeft, Printer } from "lucide-react";
import { PageSpinner, EmptyState, PrimaryButton } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/bookings/$id/receipt")({
  head: () => ({ meta: [{ title: "Receipt — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: ReceiptPage,
});

function ReceiptPage() {
  const { id } = Route.useParams();
  const { user, loading: sessionLoading } = useSession();
  const currency = useCurrency();

  const { data: booking, isLoading } = useQuery({
    queryKey: ["booking-receipt", id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "*, provider:provider_profiles!bookings_provider_id_fkey(business_name,city), customer:profiles!bookings_customer_id_fkey(full_name), category:service_categories(name,icon)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  if (sessionLoading || isLoading) return <PageSpinner />;

  if (!booking) {
    return (
      <div className="min-h-screen bg-canvas px-4 py-10">
        <EmptyState title="Receipt not found" description="This booking doesn't exist or you don't have access to it." />
        <div className="mt-4 text-center">
          <Link to="/bookings" className="text-sm font-bold text-accent">Back to bookings</Link>
        </div>
      </div>
    );
  }

  const issuedAt = new Date(booking.created_at).toLocaleString();
  const scheduledAt = new Date(booking.scheduled_at).toLocaleString();

  return (
    <div className="min-h-screen bg-canvas px-4 py-6">
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>

      <div className="no-print mx-auto max-w-lg mb-4 flex items-center justify-between">
        <Link to="/bookings" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand/60 hover:text-brand">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <PrimaryButton onClick={() => window.print()} className="px-4 py-2 text-xs rounded-xl">
          <Printer className="size-3.5" /> Print
        </PrimaryButton>
      </div>

      <div className="light-surface mx-auto max-w-lg rounded-[2rem] border border-soft bg-white/95 p-8 shadow-soft">
        <div className="flex items-center justify-between border-b border-dashed border-brand/15 pb-5">
          <div>
            <div className="text-xl font-black tracking-tight">Fixrly</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand/40">Payment receipt</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand/40">Booking ID</div>
            <div className="font-mono font-bold text-accent">{booking.booking_number}</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand/40">Issued</div>
            <div className="mt-0.5 font-medium">{issuedAt}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand/40">Booking status</div>
            <div className="mt-0.5 font-medium capitalize">{booking.status}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand/40">Customer</div>
            <div className="mt-0.5 font-medium">{booking.customer?.full_name ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand/40">Provider</div>
            <div className="mt-0.5 font-medium">{booking.provider?.business_name ?? "—"}</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-canvas p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-brand/60">Service</span><span className="font-medium">{booking.category?.icon} {booking.category?.name ?? "Service"}</span></div>
          <div className="flex justify-between"><span className="text-brand/60">Scheduled</span><span className="font-medium">{scheduledAt}</span></div>
          <div className="flex justify-between"><span className="text-brand/60">Duration</span><span className="font-medium">{booking.duration_hours}h</span></div>
          <div className="flex justify-between"><span className="text-brand/60">Address</span><span className="font-medium text-right">{booking.address}</span></div>
        </div>

        <div className="mt-6 border-t border-dashed border-brand/15 pt-5 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-brand/60">Payment status</span>
            <span className="font-bold">{getPaymentStatusLabel(booking.payment_status)}</span>
          </div>
          {booking.payment_reference && (
            <div className="flex justify-between text-sm">
              <span className="text-brand/60">Payment reference</span>
              <span className="font-mono text-xs">{booking.payment_reference}</span>
            </div>
          )}
          {booking.paid_at && (
            <div className="flex justify-between text-sm">
              <span className="text-brand/60">Paid on</span>
              <span className="font-medium">{new Date(booking.paid_at).toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline pt-2">
            <span className="text-sm font-bold uppercase tracking-wider text-brand/60">Total</span>
            <span className="font-mono font-black text-2xl text-accent">
              {formatMoney(booking.total_price, booking.payment_currency ?? currency)}
            </span>
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] text-brand/40">Thank you for using Fixrly. Keep this receipt for your records.</p>
      </div>
    </div>
  );
}
