import { defineHandler } from "nitro";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// This lives outside src/ (in Nitro's server-only scan dir), so it can't rely
// on the app's @/ path aliases — the Supabase admin client is rebuilt inline
// rather than importing src/integrations/supabase/client.server.ts.
function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input as any, { ...init, headers });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function signatureMatches(secretKey: string, rawBody: string, signature: string): boolean {
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  return expectedBuf.length === signatureBuf.length && timingSafeEqual(expectedBuf, signatureBuf);
}

async function handleChargeSuccess(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>, data: any, matchedMode: string) {
  const { data: booking } = await supabaseAdmin!
    .from("bookings")
    .select("id,payment_status,payment_amount,payment_currency,payment_mode")
    .eq("payment_reference", data.reference)
    .maybeSingle();

  if (!booking || booking.payment_status === "paid") return;
  // The key that verified this event's signature must match the mode this
  // specific booking was actually initialized under.
  if (booking.payment_mode && booking.payment_mode !== matchedMode) return;

  const expectedKobo = Math.round(Number(booking.payment_amount ?? 0) * 100);
  const verified = data.status === "success" && data.amount === expectedKobo && data.currency === booking.payment_currency;
  if (!verified) return;

  // Same payout-snapshot formula as verifyPaystackPayment (src/lib/payments.functions.ts)
  // — keep the two byte-for-byte identical, this is the defense-in-depth
  // path independent of the customer's browser making it back to the app.
  const { data: paymentSettings } = await supabaseAdmin!
    .from("admin_settings")
    .select("platform_fee_percent")
    .eq("id", "payments")
    .maybeSingle();
  const feePercent = Number((paymentSettings as any)?.platform_fee_percent ?? 0);
  const payoutAmount =
    booking.payment_amount != null
      ? Math.round(Number(booking.payment_amount) * (1 - feePercent / 100) * 100) / 100
      : null;

  await supabaseAdmin!
    .from("bookings")
    .update({ payment_status: "paid", paid_at: new Date().toISOString(), provider_payout_amount: payoutAmount })
    .eq("id", booking.id);
}

// Final word on a provider payout — confirms or reverses what
// approveWithdrawal (src/lib/withdrawals.functions.ts) optimistically set to
// "processing" once it kicked off the Paystack transfer. Matched by transfer
// reference, not booking reference — a completely separate object on
// Paystack's side, hence the separate lookup table.
async function handleTransferEvent(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  event: string,
  data: any,
  matchedMode: string,
) {
  const { data: withdrawal } = await supabaseAdmin!
    .from("withdrawal_requests")
    .select("id,provider_id,status,mode")
    .eq("paystack_transfer_reference", data.reference)
    .maybeSingle();

  if (!withdrawal || withdrawal.status !== "processing") return;
  if (withdrawal.mode && withdrawal.mode !== matchedMode) return;

  if (event === "transfer.success") {
    await supabaseAdmin!.from("withdrawal_requests").update({ status: "paid" }).eq("id", withdrawal.id);
    await supabaseAdmin!.from("notifications").insert({
      user_id: withdrawal.provider_id,
      type: "withdrawal_paid",
      title: "Withdrawal paid",
      body: "Your withdrawal has been paid out to your bank account.",
      data: { withdrawal_id: withdrawal.id },
    });
  } else {
    // transfer.failed or transfer.reversed
    await supabaseAdmin!
      .from("withdrawal_requests")
      .update({ status: "failed", admin_notes: data.message ?? event })
      .eq("id", withdrawal.id);
    await supabaseAdmin!.from("notifications").insert({
      user_id: withdrawal.provider_id,
      type: "withdrawal_failed",
      title: "Withdrawal failed",
      body: "Your withdrawal could not be completed. Please contact support.",
      data: { withdrawal_id: withdrawal.id },
    });
  }
}

// Defense-in-depth confirmation, independent of the customer's/provider's
// browser making it back to the app — Paystack calls this directly from
// their servers once a charge settles or a transfer resolves, so a closed
// tab or dropped redirect can't leave anything stuck in an interim status
// after money actually moved.
export default defineHandler(async (event) => {
  const rawBody = await event.req.text();
  const signature = event.req.headers.get("x-paystack-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  // Test-mode and live-mode events land on the same webhook URL, each
  // signed with its own secret — we don't know which mode this event is
  // for until the signature tells us, so try both keys.
  const liveKey = process.env.PAYSTACK_SECRET_KEY;
  const testKey = process.env.PAYSTACK_TEST_SECRET_KEY;
  const matchedMode = liveKey && signatureMatches(liveKey, rawBody, signature)
    ? "live"
    : testKey && signatureMatches(testKey, rawBody, signature)
      ? "sandbox"
      : null;
  if (!matchedMode) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  const supabaseAdmin = createSupabaseAdmin();
  if (!supabaseAdmin) {
    console.error("[paystack-webhook] Missing Supabase server env vars");
    return new Response("ok", { status: 200 });
  }

  switch (payload.event) {
    case "charge.success":
      await handleChargeSuccess(supabaseAdmin, payload.data, matchedMode);
      break;
    case "transfer.success":
    case "transfer.failed":
    case "transfer.reversed":
      await handleTransferEvent(supabaseAdmin, payload.event, payload.data, matchedMode);
      break;
  }

  return new Response("ok", { status: 200 });
});
