import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAYSTACK_BASE, paystackSecretKeyForMode } from "@/lib/paystack";

async function requireRole(supabaseAdmin: any, userId: string, role: "provider" | "admin") {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", role).maybeSingle();
  if (!data) throw new Error(`Forbidden: ${role} role required`);
}

async function getPaymentSettings(supabaseAdmin: any) {
  const { data } = await supabaseAdmin.from("admin_settings").select("mode,currency").eq("id", "payments").maybeSingle();
  return { mode: data?.mode ?? "sandbox", currency: data?.currency ?? "NGN" };
}

// Lists banks for the bank-selection dropdown on the provider payout form.
export const listPaystackBanks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireRole(supabaseAdmin, context.userId, "provider");

    const { mode, currency } = await getPaymentSettings(supabaseAdmin);
    const secretKey = paystackSecretKeyForMode(mode);
    if (!secretKey) throw new Error("Payments aren't configured");

    const res = await fetch(`${PAYSTACK_BASE}/bank?currency=${encodeURIComponent(currency)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const json: any = await res.json();
    if (!res.ok || !json?.status) throw new Error(json?.message ?? "Could not load banks");

    return (json.data as any[]).map((b) => ({ name: b.name as string, code: b.code as string }));
  });

// Preview-only — resolves an account number to its registered name so the
// provider can confirm "is this you?" before saving. No DB write.
export const resolvePayoutAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountNumber: string; bankCode: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireRole(supabaseAdmin, context.userId, "provider");

    const { mode } = await getPaymentSettings(supabaseAdmin);
    const secretKey = paystackSecretKeyForMode(mode);
    if (!secretKey) throw new Error("Payments aren't configured");

    const res = await fetch(
      `${PAYSTACK_BASE}/bank/resolve?account_number=${encodeURIComponent(data.accountNumber)}&bank_code=${encodeURIComponent(data.bankCode)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } },
    );
    const json: any = await res.json();
    if (!res.ok || !json?.status) throw new Error(json?.message ?? "Could not verify account details");

    return { accountName: json.data.account_name as string };
  });

// Saves the provider's payout bank account. Always re-resolves the account
// name server-side rather than trusting whatever the client last previewed
// via resolvePayoutAccount — a modified client could otherwise call this
// directly with a fabricated name.
export const savePayoutAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountNumber: string; bankCode: string; bankName: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireRole(supabaseAdmin, context.userId, "provider");

    const { mode, currency } = await getPaymentSettings(supabaseAdmin);
    const secretKey = paystackSecretKeyForMode(mode);
    if (!secretKey) throw new Error("Payments aren't configured");

    const resolveRes = await fetch(
      `${PAYSTACK_BASE}/bank/resolve?account_number=${encodeURIComponent(data.accountNumber)}&bank_code=${encodeURIComponent(data.bankCode)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } },
    );
    const resolveJson: any = await resolveRes.json();
    if (!resolveRes.ok || !resolveJson?.status) throw new Error(resolveJson?.message ?? "Could not verify account details");
    const accountName = resolveJson.data.account_name as string;

    const recipientRes = await fetch(`${PAYSTACK_BASE}/transferrecipient`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "nuban",
        name: accountName,
        account_number: data.accountNumber,
        bank_code: data.bankCode,
        currency,
      }),
    });
    const recipientJson: any = await recipientRes.json();
    if (!recipientRes.ok || !recipientJson?.status) throw new Error(recipientJson?.message ?? "Could not register payout account");

    const { error } = await supabaseAdmin.from("provider_payout_accounts").upsert(
      {
        provider_id: context.userId,
        bank_name: data.bankName,
        bank_code: data.bankCode,
        account_number: data.accountNumber,
        account_name: accountName,
        paystack_recipient_code: recipientJson.data.recipient_code,
      },
      { onConflict: "provider_id" },
    );
    if (error) throw new Error(error.message);

    return { accountName };
  });

// Admin-only. Initiates the actual Paystack transfer for a pending
// withdrawal request. Direct supabaseAdmin writes rather than a SQL RPC —
// this needs to call out to Paystack with a server-only secret key, the same
// reason verifyPaystackPayment writes bookings directly instead of through
// an RPC. The status='pending' guard in the first update doubles as a
// double-click guard: if two requests race, only one gets a row back.
export const approveWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { withdrawalId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireRole(supabaseAdmin, context.userId, "admin");

    const { mode } = await getPaymentSettings(supabaseAdmin);
    const secretKey = paystackSecretKeyForMode(mode);
    if (!secretKey) throw new Error("Payments aren't configured");

    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("withdrawal_requests")
      .update({ status: "processing", reviewed_by: context.userId, reviewed_at: new Date().toISOString() })
      .eq("id", data.withdrawalId)
      .eq("status", "pending")
      .select("id,amount,payout_account_id")
      .single();
    if (claimError || !claimed) throw new Error("Already processed");

    const { data: account, error: accountError } = await supabaseAdmin
      .from("provider_payout_accounts")
      .select("paystack_recipient_code")
      .eq("id", claimed.payout_account_id)
      .maybeSingle();
    if (accountError || !account?.paystack_recipient_code) {
      await supabaseAdmin
        .from("withdrawal_requests")
        .update({ status: "failed", admin_notes: "Payout account has no Paystack recipient" })
        .eq("id", data.withdrawalId);
      throw new Error("Payout account is not properly configured");
    }

    const reference = `withdrawal_${data.withdrawalId}_${Date.now()}`;
    const res = await fetch(`${PAYSTACK_BASE}/transfer`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "balance",
        amount: Math.round(Number(claimed.amount) * 100),
        recipient: account.paystack_recipient_code,
        reason: "Fixrly provider payout",
        reference,
      }),
    });
    const json: any = await res.json();

    if (!res.ok || !json?.status) {
      await supabaseAdmin
        .from("withdrawal_requests")
        .update({ status: "failed", admin_notes: json?.message ?? "Transfer could not be initiated", mode })
        .eq("id", data.withdrawalId);
      throw new Error(json?.message ?? "Could not initiate transfer");
    }

    // Paystack can settle instantly (no OTP required) or leave it pending —
    // either way we record the reference now; the webhook confirms the
    // final paid/failed state, this just tracks what's in flight.
    const instantlySuccessful = json.data.status === "success";
    await supabaseAdmin
      .from("withdrawal_requests")
      .update({
        status: instantlySuccessful ? "paid" : "processing",
        paystack_transfer_code: json.data.transfer_code,
        paystack_transfer_reference: reference,
        mode,
      })
      .eq("id", data.withdrawalId);

    return { status: instantlySuccessful ? "paid" : "processing" };
  });
