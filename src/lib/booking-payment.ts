import { supabase } from "@/integrations/supabase/client";

export type BookingPaymentStatus = "not_required" | "pending" | "paid" | "failed";

export type BookingPaymentSettings = {
  provider: string;
  mode: string;
  currency: string;
  payment_enabled: boolean;
  publishable_key: string | null;
  platform_fee_percent: number;
};

export async function getBookingPaymentSettings(): Promise<BookingPaymentSettings> {
  const { data, error } = await supabase
    .from("admin_settings")
    .select("provider,mode,currency,payment_enabled,publishable_key,platform_fee_percent")
    .eq("id", "payments")
    .maybeSingle();

  if (error) throw error;

  return {
    provider: data?.provider ?? "none",
    mode: data?.mode ?? "sandbox",
    currency: data?.currency ?? "NGN",
    payment_enabled: !!data?.payment_enabled,
    publishable_key: data?.publishable_key ?? null,
    platform_fee_percent: Number(data?.platform_fee_percent ?? 0),
  } as BookingPaymentSettings;
}

export function buildBookingPaymentData(totalPrice: number | null, settings: BookingPaymentSettings) {
  // A provider with no hourly rate set produces a null/zero total — nothing
  // to charge, so payment must stay "not_required" even with payments
  // enabled globally. Otherwise the booking gets stuck as "pending" forever:
  // initializePaystackPayment always rejects a zero/undefined amount, so the
  // customer would have no way to ever clear a "Pay now" that can't run.
  const paymentEnabled = settings.payment_enabled && settings.provider !== "none" && totalPrice != null && totalPrice > 0;
  const paymentAmount = totalPrice != null ? Number(totalPrice) : null;

  // No payment_reference here — a real reference is only created once the
  // customer actually starts a charge (see initializePaystackPayment), never
  // faked up front just to make the row look "paid-ish".
  return {
    payment_provider: paymentEnabled ? settings.provider : "none",
    payment_status: paymentEnabled ? "pending" : "not_required",
    payment_amount: paymentAmount,
  };
}

export function getPaymentStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "paid":
      return "Paid";
    case "pending":
      return "Payment pending";
    case "failed":
      return "Payment failed";
    default:
      return "No payment required";
  }
}

export function getPaymentStatusBadge(status: string | null | undefined) {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-700";
    case "pending":
      return "bg-amber-100 text-amber-700";
    case "failed":
      return "bg-red-100 text-red-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}
