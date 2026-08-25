-- Provider business back-office: staff/team accounts, job assignment on top
-- of existing bookings, lightweight invoicing, and per-client notes for
-- providers running a real team rather than a solo operation.
--
-- Deliberately does NOT introduce a new "organization" entity —
-- provider_profiles.id stays the business's identity everywhere it already
-- is (payouts, categories, bookings, ...). provider_staff is a satellite
-- table mapping *other* Firebase accounts onto that same provider_id as
-- members, the same shape provider_payout_accounts/withdrawal_requests
-- already use. A "job" is just a booking — duplicating that lifecycle into
-- a parallel table would fork the source of truth for no benefit at this
-- scope, so "job management" is: assigning bookings.assigned_staff_id and
-- extending enforce_booking_update_rules with scoped staff permissions.
--
-- Invite is a shareable link (token), not an email send — there's no
-- reliable transactional email pipeline in this app today. Whoever holds
-- the link can claim it once signed in; no email-match verification, same
-- trust model as any shareable invite link.

-- ============ provider_staff ============
CREATE TABLE public.provider_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  staff_user_id text,
  role text NOT NULL DEFAULT 'technician' CHECK (role IN ('dispatcher', 'technician')),
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'removed')),
  invited_email text NOT NULL,
  invite_token text UNIQUE,
  invited_by text,
  invited_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_staff_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  CONSTRAINT provider_staff_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT provider_staff_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id),
  CONSTRAINT provider_staff_provider_staff_unique UNIQUE (provider_id, staff_user_id)
);

CREATE INDEX provider_staff_provider_id_idx ON public.provider_staff (provider_id);

ALTER TABLE public.provider_staff ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.provider_staff TO authenticated;
GRANT ALL ON public.provider_staff TO service_role;

-- No INSERT/UPDATE policy for authenticated — every write goes through the
-- RPCs below, which can't be bypassed by a raw REST call (unlike a bare
-- WITH CHECK, which can't express "this token round-trip actually
-- happened").
CREATE POLICY "Owner and staff view provider_staff" ON public.provider_staff
  FOR SELECT TO authenticated
  USING (public.uid() = provider_id OR public.uid() = staff_user_id OR public.has_role(public.uid(), 'admin'));

CREATE TRIGGER trg_provider_staff_updated
  BEFORE UPDATE ON public.provider_staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ is_provider_staff ============
-- Mirrors has_role's shape exactly so it reads the same way at every call
-- site. SECURITY INVOKER (no elevation needed) — RLS on provider_staff
-- already lets the owner and the staff member themselves see the row that
-- would make this true, and it's only ever used inside other SECURITY
-- DEFINER functions or the update-rules trigger, both of which already run
-- with elevated rights.
CREATE OR REPLACE FUNCTION public.is_provider_staff(_provider_id text, _uid text DEFAULT public.uid())
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.provider_staff
    WHERE provider_id = _provider_id AND staff_user_id = _uid AND status = 'active'
  );
$$;

-- ============ invite_staff_member ============
CREATE OR REPLACE FUNCTION public.invite_staff_member(_email text, _role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid text := public.uid();
  token text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(uid, 'provider') THEN
    RAISE EXCEPTION 'Only providers can invite staff';
  END IF;
  IF _role NOT IN ('dispatcher', 'technician') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  IF _email IS NULL OR btrim(_email) = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.provider_staff (provider_id, invited_email, role, invite_token, invited_by)
  VALUES (uid, btrim(lower(_email)), _role, token, uid);

  RETURN token;
END;
$$;

-- ============ claim_staff_invite ============
CREATE OR REPLACE FUNCTION public.claim_staff_invite(_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid text := public.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.provider_staff
    SET staff_user_id = uid, status = 'active', joined_at = now()
    WHERE invite_token = _token AND status = 'invited';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invite link is invalid or has already been used';
  END IF;
END;
$$;

-- ============ manage_staff_member ============
-- _role/_status pass NULL to leave that column unchanged.
CREATE OR REPLACE FUNCTION public.manage_staff_member(_staff_id uuid, _role text, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid text := public.uid();
  owner_id text;
BEGIN
  SELECT provider_id INTO owner_id FROM public.provider_staff WHERE id = _staff_id;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Staff member not found';
  END IF;
  IF uid IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'Only the business owner can manage staff';
  END IF;
  IF _role IS NOT NULL AND _role NOT IN ('dispatcher', 'technician') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  IF _status IS NOT NULL AND _status NOT IN ('active', 'removed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.provider_staff
    SET role = COALESCE(_role, role), status = COALESCE(_status, status)
    WHERE id = _staff_id;
END;
$$;

REVOKE ALL ON FUNCTION public.is_provider_staff(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_staff_member(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_staff_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_staff_member(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_provider_staff(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_staff_member(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_staff_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_staff_member(uuid, text, text) TO authenticated;

-- ============ bookings.assigned_staff_id + RLS/trigger extension ============
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS assigned_staff_id text REFERENCES public.profiles(id);

DROP POLICY IF EXISTS "Booking parties can view" ON public.bookings;
CREATE POLICY "Booking parties can view" ON public.bookings
  FOR SELECT TO authenticated
  USING (
    public.uid() = customer_id
    OR public.uid() = provider_id
    OR public.is_provider_staff(provider_id)
    OR public.has_role(public.uid(), 'admin')
  );

CREATE OR REPLACE FUNCTION public.enforce_booking_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  location_changed boolean;
  is_on_the_way_transition boolean;
  is_location_ping boolean;
  staff_role text;
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(public.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
    OR NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
    OR NEW.duration_hours IS DISTINCT FROM OLD.duration_hours
    OR NEW.address IS DISTINCT FROM OLD.address
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.total_price IS DISTINCT FROM OLD.total_price
    OR NEW.booking_number IS DISTINCT FROM OLD.booking_number
    OR NEW.payment_provider IS DISTINCT FROM OLD.payment_provider
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
    OR NEW.payment_amount IS DISTINCT FROM OLD.payment_amount
    OR NEW.payment_currency IS DISTINCT FROM OLD.payment_currency
    OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
    OR NEW.dest_lat IS DISTINCT FROM OLD.dest_lat
    OR NEW.dest_lng IS DISTINCT FROM OLD.dest_lng
  THEN
    RAISE EXCEPTION 'Only booking status and en-route location can be changed';
  END IF;

  location_changed :=
    NEW.provider_lat IS DISTINCT FROM OLD.provider_lat
    OR NEW.provider_lng IS DISTINCT FROM OLD.provider_lng
    OR NEW.provider_location_updated_at IS DISTINCT FROM OLD.provider_location_updated_at;

  is_on_the_way_transition := NEW.status = 'on_the_way' AND OLD.status = 'accepted';
  is_location_ping := NEW.status = OLD.status AND OLD.status = 'on_the_way';

  IF location_changed AND public.uid() IS DISTINCT FROM OLD.provider_id THEN
    RAISE EXCEPTION 'Only the assigned provider can update en-route location';
  END IF;
  IF location_changed AND NOT (is_on_the_way_transition OR is_location_ping) THEN
    RAISE EXCEPTION 'Location can only be set when going on_the_way or while already en route';
  END IF;

  IF is_location_ping THEN
    RETURN NEW;
  END IF;

  IF public.uid() = OLD.customer_id THEN
    IF NOT (NEW.status = 'cancelled' AND OLD.status IN ('pending', 'accepted', 'on_the_way')) THEN
      RAISE EXCEPTION 'Customers may only cancel a pending, accepted, or en-route booking';
    END IF;
  ELSIF public.uid() = OLD.provider_id THEN
    IF NOT (
      (NEW.status IN ('accepted', 'rejected') AND OLD.status = 'pending')
      OR is_on_the_way_transition
      OR (NEW.status = 'completed' AND OLD.status IN ('accepted', 'on_the_way'))
    ) THEN
      RAISE EXCEPTION 'Invalid booking status transition for provider';
    END IF;
  ELSIF public.is_provider_staff(OLD.provider_id) THEN
    SELECT role INTO staff_role FROM public.provider_staff
      WHERE provider_id = OLD.provider_id AND staff_user_id = public.uid() AND status = 'active';

    IF NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id THEN
      IF staff_role <> 'dispatcher' THEN
        RAISE EXCEPTION 'Only a dispatcher can reassign a job';
      END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF staff_role = 'dispatcher' THEN
        IF NOT (
          (NEW.status IN ('accepted', 'rejected') AND OLD.status = 'pending')
          OR is_on_the_way_transition
          OR (NEW.status = 'completed' AND OLD.status IN ('accepted', 'on_the_way'))
        ) THEN
          RAISE EXCEPTION 'Invalid booking status transition';
        END IF;
      ELSE
        IF OLD.assigned_staff_id IS DISTINCT FROM public.uid() THEN
          RAISE EXCEPTION 'You can only update jobs assigned to you';
        END IF;
        IF NOT (is_on_the_way_transition OR (NEW.status = 'completed' AND OLD.status IN ('accepted', 'on_the_way'))) THEN
          RAISE EXCEPTION 'Technicians cannot accept, reject, or cancel a job';
        END IF;
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a party to this booking';
  END IF;

  RETURN NEW;
END;
$$;

-- ============ invoices ============
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  provider_id text NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]',
  subtotal numeric NOT NULL DEFAULT 0,
  tax_percent numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CONSTRAINT invoices_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE,
  CONSTRAINT invoices_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

CREATE INDEX invoices_provider_id_idx ON public.invoices (provider_id);
CREATE INDEX invoices_booking_id_idx ON public.invoices (booking_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

CREATE POLICY "Business and customer view invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    public.uid() = provider_id
    OR public.is_provider_staff(provider_id)
    OR public.has_role(public.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.customer_id = public.uid())
  );

CREATE TRIGGER trg_invoices_updated
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ upsert_invoice / mark_invoice_paid ============
-- No direct INSERT/UPDATE policy — financial records only ever get written
-- through these two RPCs, same "no client writes to money records"
-- reasoning as withdrawal_requests.
CREATE OR REPLACE FUNCTION public.upsert_invoice(
  _id uuid,
  _booking_id uuid,
  _line_items jsonb,
  _tax_percent numeric,
  _notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid text := public.uid();
  owner_id text;
  staff_role text;
  item jsonb;
  computed_subtotal numeric := 0;
  computed_total numeric;
  new_id uuid;
BEGIN
  SELECT provider_id INTO owner_id FROM public.bookings WHERE id = _booking_id;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF uid IS DISTINCT FROM owner_id THEN
    SELECT role INTO staff_role FROM public.provider_staff
      WHERE provider_id = owner_id AND staff_user_id = uid AND status = 'active';
    IF staff_role IS DISTINCT FROM 'dispatcher' THEN
      RAISE EXCEPTION 'Only the business owner or a dispatcher can manage invoices';
    END IF;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_line_items) LOOP
    computed_subtotal := computed_subtotal + (COALESCE((item->>'quantity')::numeric, 0) * COALESCE((item->>'unit_price')::numeric, 0));
  END LOOP;
  computed_total := computed_subtotal + (computed_subtotal * COALESCE(_tax_percent, 0) / 100);

  IF _id IS NULL THEN
    INSERT INTO public.invoices (booking_id, provider_id, line_items, subtotal, tax_percent, total, notes, created_by)
    VALUES (_booking_id, owner_id, _line_items, computed_subtotal, COALESCE(_tax_percent, 0), computed_total, _notes, uid)
    RETURNING id INTO new_id;
    RETURN new_id;
  ELSE
    UPDATE public.invoices
      SET line_items = _line_items, subtotal = computed_subtotal, tax_percent = COALESCE(_tax_percent, 0),
          total = computed_total, notes = _notes
      WHERE id = _id AND provider_id = owner_id AND status = 'draft';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice not found or no longer editable';
    END IF;
    RETURN _id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_invoice_paid(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid text := public.uid();
  owner_id text;
  staff_role text;
BEGIN
  SELECT provider_id INTO owner_id FROM public.invoices WHERE id = _id;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF uid IS DISTINCT FROM owner_id THEN
    SELECT role INTO staff_role FROM public.provider_staff
      WHERE provider_id = owner_id AND staff_user_id = uid AND status = 'active';
    IF staff_role IS DISTINCT FROM 'dispatcher' THEN
      RAISE EXCEPTION 'Only the business owner or a dispatcher can mark invoices paid';
    END IF;
  END IF;

  UPDATE public.invoices SET status = 'paid', paid_at = now() WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_invoice(uuid, uuid, jsonb, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_invoice_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_invoice(uuid, uuid, jsonb, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_invoice_paid(uuid) TO authenticated;

-- ============ provider_client_notes ============
-- Internal CRM notes, never customer-visible — direct RLS is fine here (no
-- external-verification concern like payout accounts/invoices have).
CREATE TABLE public.provider_client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  customer_id text NOT NULL,
  note text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_client_notes_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  CONSTRAINT provider_client_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT provider_client_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

CREATE INDEX provider_client_notes_provider_customer_idx ON public.provider_client_notes (provider_id, customer_id);

ALTER TABLE public.provider_client_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.provider_client_notes TO authenticated;
GRANT ALL ON public.provider_client_notes TO service_role;

CREATE POLICY "Business views client notes" ON public.provider_client_notes
  FOR SELECT TO authenticated
  USING (public.uid() = provider_id OR public.is_provider_staff(provider_id) OR public.has_role(public.uid(), 'admin'));

CREATE POLICY "Business adds client notes" ON public.provider_client_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.uid()
    AND (public.uid() = provider_id OR public.is_provider_staff(provider_id))
  );
