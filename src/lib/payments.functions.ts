import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAYSTACK_BASE = "https://api.paystack.co";

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
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) throw new Error("Payments aren't configured yet. Contact support.");

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
      .select("provider,payment_enabled,currency")
      .eq("id", "payments")
      .maybeSingle();
    const settings = settingsRow as any;
    if (!settings?.payment_enabled || settings.provider !== "paystack") {
      throw new Error("Paystack payments are not enabled");
    }
    const currency = settings.currency ?? "NGN";

    const { data: authData } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = authData?.user?.email;
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
      .update({ payment_reference: reference, payment_currency: currency, payment_provider: "paystack" })
      .eq("id", booking.id);
    if (updateError) throw new Error(updateError.message);

    return { authorizationUrl: json.data.authorization_url as string };
  });

export const verifyPaystackPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reference: string }) => d)
  .handler(async ({ data, context }) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) throw new Error("Payments aren't configured");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id,customer_id,payment_status,payment_amount,payment_currency")
      .eq("payment_reference", data.reference)
      .maybeSingle();
    if (error || !booking) throw new Error("Payment record not found");
    if (booking.customer_id !== context.userId) throw new Error("Forbidden");

    if (booking.payment_status === "paid") return { status: "paid" as const };

    const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(data.reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const json: any = await res.json();
    if (!res.ok || !json?.status) throw new Error(json?.message ?? "Could not verify payment");

    const tx = json.data;
    const expectedKobo = Math.round(Number(booking.payment_amount ?? 0) * 100);
    const verified =
      tx.status === "success" && tx.amount === expectedKobo && tx.currency === booking.payment_currency;

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        payment_status: verified ? "paid" : "failed",
        paid_at: verified ? new Date().toISOString() : null,
      })
      .eq("id", booking.id);
    if (updateError) throw new Error(updateError.message);

    return { status: (verified ? "paid" : "failed") as "paid" | "failed" };
  });
