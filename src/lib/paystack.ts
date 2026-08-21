// Shared between src/lib/payments.functions.ts (customer charges) and
// src/lib/withdrawals.functions.ts (provider payouts) so both stay in sync
// on which secret key backs which mode instead of drifting into two copies.
export const PAYSTACK_BASE = "https://api.paystack.co";

// The admin "Mode" toggle (Test/sandbox vs Live) only meant anything in the
// UI — every server call still reached for the one PAYSTACK_SECRET_KEY
// regardless, so "Test" mode silently charged real cards. Split into two
// project secrets and pick the right one by the admin_settings row instead.
export function paystackSecretKeyForMode(mode: string | null | undefined): string | undefined {
  if (mode === "live") return process.env.PAYSTACK_SECRET_KEY;
  return process.env.PAYSTACK_TEST_SECRET_KEY;
}
