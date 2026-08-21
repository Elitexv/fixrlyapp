import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAYSTACK_BASE, paystackSecretKeyForMode } from "@/lib/paystack";

function getOrigin(): string {
  const request = getRequest();
  const headerOrigin = request?.headers.get("origin");
  if (headerOrigin) return headerOrigin;
  const host = request?.headers.get("host");
  if (host) return `https://${host}`;
  return "https://fixrly.app";
}

export const initializePaystackPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bookingId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id,customer_id,total_price,payment_amount,payment_status,payment_provider")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error || !booking) throw new Error("Booking not found");
    if (booking.customer_id !== context.userId) throw new Error("Forbidden");
    if (booking.payment_status === "paid") throw new Error("This booking is already paid");

    const amount = Number(booking.payment_amount ?? booking.total_price ?? 0);
    if (!amount || amount <= 0) throw new Error("Nothing to charge for this booking");

    const { data: settingsRow } = await supabaseAdmin
      .from("admin_settings" as any)
      .select("provider,payment_enabled,currency,mode")
      .eq("id", "payments")
      .maybeSingle();
    const settings = settingsRow as any;
    if (!settings?.payment_enabled || settings.provider !== "paystack") {
      throw new Error("Paystack payments are not enabled");
    }
    const currency = settings.currency ?? "NGN";
    const mode = settings.mode === "live" ? "live" : "sandbox";

    const secretKey = paystackSecretKeyForMode(mode);
    if (!secretKey) {
      throw new Error(
        mode === "live"
          ? "Live payments aren't configured yet. Contact support."
          : "Test payments aren't configured yet — ask an admin to add the Paystack test secret key.",
      );
    }

    const { data: profile } = await supabaseAdmin.from("profiles").select("email").eq("id", context.userId).maybeSingle();
    const email = profile?.email;
    if (!email) throw new Error("Your account has no email on file");

    const reference = `booking_${booking.id}_${Date.now()}`;
    const origin = getOrigin();

    const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: Math.round(amount * 100),
        currency,
        reference,
        callback_url: `${origin}/bookings?paystack_ref=${reference}`,
        metadata: { booking_id: booking.id },
      }),
    });
    const json: any = await res.json();
    if (!res.ok || !json?.status) throw new Error(json?.message ?? "Could not start payment");

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ payment_reference: reference, payment_currency: currency, payment_provider: "paystack", payment_mode: mode })
      .eq("id", booking.id);
    if (updateError) throw new Error(updateError.message);

    return { authorizationUrl: json.data.authorization_url as string };
  });

export const verifyPaystackPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reference: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id,customer_id,payment_status,payment_amount,payment_currency,payment_mode")
      .eq("payment_reference", data.reference)
      .maybeSingle();
    if (error || !booking) throw new Error("Payment record not found");
    if (booking.customer_id !== context.userId) throw new Error("Forbidden");

    if (booking.payment_status === "paid") return { status: "paid" as const, bookingId: booking.id };

    // Use whichever mode this specific transaction was initialized under —
    // not the admin's current Mode setting, which may have changed since.
    const secretKey = paystackSecretKeyForMode(booking.payment_mode);
    if (!secretKey) throw new Error("Payments aren't configured");

    const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(data.reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const json: any = await res.json();
    if (!res.ok || !json?.status) throw new Error(json?.message ?? "Could not verify payment");

    const tx = json.data;
    const expectedKobo = Math.round(Number(booking.payment_amount ?? 0) * 100);
    const verified =
      tx.status === "success" && tx.amount === expectedKobo && tx.currency === booking.payment_currency;

    // Anything short of a confirmed success (declined, abandoned, still
    // processing) leaves the booking as "pending" rather than "failed" —
    // the customer can just retry checkout from the bookings list instead
    // of hitting a dead-end status.
    if (verified) {
      // Snapshot the provider's net payout at the moment payment is
      // confirmed, using the fee % in effect right now — a later admin
      // change to platform_fee_percent must never retroactively rewrite
      // what a provider was actually owed on a past booking. Computed off
      // payment_amount (what Paystack actually verified above), not
      // total_price, since those could in principle diverge.
      const { data: paymentSettings } = await supabaseAdmin
        .from("admin_settings" as any)
        .select("platform_fee_percent")
        .eq("id", "payments")
        .maybeSingle();
      const feePercent = Number((paymentSettings as any)?.platform_fee_percent ?? 0);
      const payoutAmount =
        booking.payment_amount != null
          ? Math.round(Number(booking.payment_amount) * (1 - feePercent / 100) * 100) / 100
          : null;

      const { error: updateError } = await supabaseAdmin
        .from("bookings")
        .update({ payment_status: "paid", paid_at: new Date().toISOString(), provider_payout_amount: payoutAmount })
        .eq("id", booking.id);
      if (updateError) throw new Error(updateError.message);
    }

    return { status: (verified ? "paid" : "pending") as "paid" | "pending", bookingId: booking.id };
  });
