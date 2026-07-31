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

// Defense-in-depth confirmation, independent of the customer's browser making
// it back to the callback page — Paystack calls this directly from their
// servers once a charge settles, so a closed tab or dropped redirect can't
// leave a booking stuck as "pending" after money actually moved.
export default defineHandler(async (event) => {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) return new Response("Not configured", { status: 503 });

  const rawBody = await event.req.text();
  const signature = event.req.headers.get("x-paystack-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== signatureBuf.length || !timingSafeEqual(expectedBuf, signatureBuf)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  if (payload.event !== "charge.success") return new Response("ok", { status: 200 });

  const supabaseAdmin = createSupabaseAdmin();
  if (!supabaseAdmin) {
    console.error("[paystack-webhook] Missing Supabase server env vars");
    return new Response("ok", { status: 200 });
  }

  const data = payload.data;
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("id,payment_status,payment_amount,payment_currency")
    .eq("payment_reference", data.reference)
    .maybeSingle();

  if (!booking || booking.payment_status === "paid") return new Response("ok", { status: 200 });

  const expectedKobo = Math.round(Number(booking.payment_amount ?? 0) * 100);
  const verified = data.status === "success" && data.amount === expectedKobo && data.currency === booking.payment_currency;
  if (!verified) return new Response("ok", { status: 200 });

  await supabaseAdmin
    .from("bookings")
    .update({ payment_status: "paid", paid_at: new Date().toISOString() })
    .eq("id", booking.id);

  return new Response("ok", { status: 200 });
});
