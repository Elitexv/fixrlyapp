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
  const paymentEnabled = settings.payment_enabled && settings.provider !== "none";
  const paymentAmount = totalPrice != null ? Number(totalPrice) : null;

  return {
    payment_provider: paymentEnabled ? settings.provider : "none",
    payment_status: paymentEnabled ? "pending" : "not_required",
    payment_amount: paymentAmount,
    payment_reference: paymentEnabled ? `${settings.provider}-${crypto.randomUUID().slice(0, 8)}` : null,
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
