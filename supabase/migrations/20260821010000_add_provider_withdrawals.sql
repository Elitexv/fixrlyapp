-- Provider withdrawals. Until now, Paystack charges from customers just sat
-- in the platform's own Paystack balance — providers had no way to get paid
-- out, and admin_settings.platform_fee_percent (10% default, configurable in
-- Admin -> Manage Payment Provider) was dead: nothing ever deducted it, so
-- there was no record of what a provider actually nets per booking.
--
-- This adds: a snapshot of each provider's real payout per paid booking
-- (bookings.provider_payout_amount, computed once at payment-verified time
-- so a later admin fee change never retroactively rewrites history), a
-- balance function, a payout bank-account table, and a withdrawal-request
-- table with an admin approve/reject flow. Approval itself (the actual
-- Paystack Transfer call) happens in src/lib/withdrawals.functions.ts, not
-- here — Postgres can't hold a live HTTP round-trip with a secret key that
-- must never be client-visible, so this migration only ever gets called
-- *after* that succeeds, via plain supabaseAdmin writes from the server fn.
-- Same reasoning as verifyPaystackPayment already writing bookings directly
-- instead of through an RPC.

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS provider_payout_amount numeric;

-- ============ provider_payout_accounts ============
-- Deliberately no INSERT/UPDATE RLS policy for `authenticated` — account_name
-- and paystack_recipient_code are only trustworthy if they came from a real
-- Paystack /bank/resolve + /transferrecipient round trip. A bare
-- WITH CHECK (uid() = provider_id) policy would let a client POST a
-- fabricated account_name via a raw REST call, skipping verification
-- entirely. All writes go through savePayoutAccount (src/lib/withdrawals.functions.ts),
-- which re-resolves server-side and never trusts client-supplied fields —
-- same "no client INSERT, only SECURITY DEFINER/service-role writers"
-- principle the notifications table already uses.
CREATE TABLE public.provider_payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL UNIQUE REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  bank_code text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  paystack_recipient_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_payout_accounts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.provider_payout_accounts TO authenticated;
GRANT ALL ON public.provider_payout_accounts TO service_role;

CREATE POLICY "Providers view own payout account" ON public.provider_payout_accounts
  FOR SELECT TO authenticated
  USING (public.uid() = provider_id OR public.has_role(public.uid(), 'admin'));

CREATE TRIGGER trg_provider_payout_accounts_updated
  BEFORE UPDATE ON public.provider_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ withdrawal_requests ============
-- Same no-client-INSERT reasoning as above: balance-sufficiency and "has a
-- verified payout account" can't be expressed in a WITH CHECK. All inserts
-- go through request_withdrawal() below; every status transition goes
-- through reject_withdrawal() or the approveWithdrawal server fn / the
-- Paystack transfer webhook, all of which do their own has_role/uid check.
-- The admin UPDATE policy is added anyway for defense-in-depth consistency
-- with the rest of the schema — it doesn't weaken anything since admins are
-- already fully trusted.
CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'rejected', 'failed')),
  payout_account_id uuid NOT NULL,
  mode text,
  paystack_transfer_code text,
  paystack_transfer_reference text UNIQUE,
  admin_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT withdrawal_requests_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  CONSTRAINT withdrawal_requests_payout_account_id_fkey FOREIGN KEY (payout_account_id) REFERENCES public.provider_payout_accounts(id),
  CONSTRAINT withdrawal_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id)
);

CREATE INDEX withdrawal_requests_provider_id_idx ON public.withdrawal_requests (provider_id);
CREATE INDEX withdrawal_requests_status_idx ON public.withdrawal_requests (status);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;

CREATE POLICY "Providers view own withdrawal requests" ON public.withdrawal_requests
  FOR SELECT TO authenticated
  USING (public.uid() = provider_id OR public.has_role(public.uid(), 'admin'));

CREATE POLICY "Admins can update withdrawal requests" ON public.withdrawal_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(public.uid(), 'admin'))
  WITH CHECK (public.has_role(public.uid(), 'admin'));

CREATE TRIGGER trg_withdrawal_requests_updated
  BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ provider_available_balance ============
-- SECURITY INVOKER (no elevation, matches public.uid()'s own style) — the
-- RLS already on bookings ("Booking parties can view", includes admin) and
-- withdrawal_requests (above) grants exactly the right visibility to
-- whoever calls this: a provider gets their own real number, an admin gets
-- any provider's real number, anyone else calling it for someone else's id
-- silently gets 0 (RLS just filters the underlying rows to nothing) rather
-- than an error or a data leak.
CREATE OR REPLACE FUNCTION public.provider_available_balance(_provider_id text)
RETURNS numeric
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE((
      SELECT SUM(b.provider_payout_amount) FROM public.bookings b
      WHERE b.provider_id = _provider_id AND b.status = 'completed' AND b.payment_status = 'paid'
    ), 0)
    - COALESCE((
      SELECT SUM(w.amount) FROM public.withdrawal_requests w
      WHERE w.provider_id = _provider_id AND w.status NOT IN ('rejected', 'failed')
    ), 0);
$$;

-- ============ request_withdrawal ============
-- Advisory lock serializes concurrent calls from the same provider (e.g. a
-- double-click or two open tabs) so two requests can't both read a stale
-- balance before either insert lands.
CREATE OR REPLACE FUNCTION public.request_withdrawal(_amount numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid text := public.uid();
  account_id uuid;
  recipient_code text;
  available numeric;
  request_currency text;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('withdrawal:' || uid));

  IF NOT public.has_role(uid, 'provider') THEN
    RAISE EXCEPTION 'Only providers can request withdrawals';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  SELECT id, paystack_recipient_code INTO account_id, recipient_code
    FROM public.provider_payout_accounts WHERE provider_id = uid;
  IF account_id IS NULL OR recipient_code IS NULL THEN
    RAISE EXCEPTION 'Add and verify your payout bank details first';
  END IF;

  available := public.provider_available_balance(uid);
  IF _amount > available THEN
    RAISE EXCEPTION 'Amount exceeds your available balance';
  END IF;

  SELECT currency INTO request_currency FROM public.admin_settings WHERE id = 'payments';

  INSERT INTO public.withdrawal_requests (provider_id, amount, currency, payout_account_id)
  VALUES (uid, _amount, COALESCE(request_currency, 'NGN'), account_id)
  RETURNING id INTO new_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT ur.user_id, 'withdrawal_requested', 'New withdrawal request',
         'A provider requested a payout.', jsonb_build_object('withdrawal_id', new_id, 'amount', _amount)
  FROM public.user_roles ur WHERE ur.role = 'admin';

  RETURN new_id;
END;
$$;

-- ============ reject_withdrawal ============
CREATE OR REPLACE FUNCTION public.reject_withdrawal(_id uuid, _notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_provider_id text;
BEGIN
  IF NOT public.has_role(public.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject withdrawal requests';
  END IF;

  UPDATE public.withdrawal_requests
    SET status = 'rejected', admin_notes = _notes, reviewed_by = public.uid(), reviewed_at = now()
    WHERE id = _id AND status = 'pending'
    RETURNING provider_id INTO request_provider_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not pending or not found'; END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (request_provider_id, 'withdrawal_rejected', 'Withdrawal rejected',
          COALESCE(_notes, 'Your withdrawal request was rejected.'), jsonb_build_object('withdrawal_id', _id));
END;
$$;

REVOKE ALL ON FUNCTION public.provider_available_balance(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_withdrawal(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_withdrawal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_available_balance(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal(uuid, text) TO authenticated;
