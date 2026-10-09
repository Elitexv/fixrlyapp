import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { formatMoney, useCurrency } from "@/lib/currency";
import { getPaymentStatusLabel } from "@/lib/booking-payment";
import { ArrowLeft, Printer } from "lucide-react";
import { PageSpinner, EmptyState, PrimaryButton } from "@/components/ui-kit";
import { LogoMark } from "@/components/Logo";

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
          "*, provider:provider_profiles!bookings_provider_id_fkey(business_name,city), customer:profiles!bookings_customer_id_profiles_fkey(full_name), category:service_categories(name,icon)",
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
          <Link to="/bookings" className="text-sm font-semibold text-accent">Back to bookings</Link>
        </div>
      </div>
    );
  }

  const issuedAt = new Date(booking.created_at).toLocaleString();
  const scheduledAt = new Date(booking.scheduled_at).toLocaleString();

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{children}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas px-4 py-6">
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; padding: 0 !important; } }`}</style>

      <div className="no-print mx-auto mb-4 flex max-w-lg items-center justify-between">
        <Link to="/bookings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand/60 hover:text-brand">
          <ArrowLeft className="size-4" /> Back to bookings
        </Link>
        <PrimaryButton onClick={() => window.print()} className="px-4 py-2 text-xs">
          <Printer className="size-3.5" /> Print
        </PrimaryButton>
      </div>

      {/* Always light, in-app and on paper — it's a document. */}
      <article className="light-surface mx-auto max-w-lg overflow-hidden rounded-2xl border border-soft bg-white shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
        <header className="flex items-center justify-between bg-[#0b1730] px-6 py-5 text-white">
          <div className="flex items-center gap-1">
            <LogoMark className="size-9 text-accent" />
            <div>
              <div className="text-xl font-extrabold leading-none tracking-tight">fixrly</div>
              <div className="mt-1 text-[11px] font-medium text-white/60">Payment receipt</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-white/60">Booking ID</div>
            <div className="font-bold text-orange-300">#{booking.booking_number ?? booking.id.slice(0, 8)}</div>
          </div>
        </header>

        <div className="p-6">
          <div className="text-center">
            <div className="text-xs font-medium text-slate-500">Total</div>
            <div className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
              {formatMoney(booking.total_price, booking.payment_currency ?? currency)}
            </div>
            <span
              className={`mt-2 inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${
                booking.payment_status === "paid" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {getPaymentStatusLabel(booking.payment_status)}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-sm">
            <div>
              <div className="text-xs text-slate-500">Customer</div>
              <div className="mt-0.5 font-semibold text-slate-900">{booking.customer?.full_name ?? "—"}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Provider</div>
              <div className="mt-0.5 font-semibold text-slate-900">{booking.provider?.business_name ?? "—"}</div>
            </div>
          </div>

          <div className="mt-5 divide-y divide-dashed divide-slate-200">
            <Row label="Service">{booking.category?.name ?? "Service"}</Row>
            <Row label="Scheduled">{scheduledAt}</Row>
            <Row label="Duration">{booking.duration_hours}h</Row>
            <Row label="Address">{booking.address}</Row>
            <Row label="Booking status">
              <span className="capitalize">{String(booking.status).replace(/_/g, " ")}</span>
            </Row>
            <Row label="Issued">{issuedAt}</Row>
            {booking.paid_at && <Row label="Paid on">{new Date(booking.paid_at).toLocaleString()}</Row>}
            {booking.payment_reference && (
              <Row label="Payment reference">
                <span className="break-all text-xs">{booking.payment_reference}</span>
              </Row>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">Thank you for using Fixrly. Keep this receipt for your records.</p>
        </div>
      </article>
    </div>
  );
}
