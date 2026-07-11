
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'provider', 'customer');
CREATE TYPE public.booking_status AS ENUM ('pending', 'accepted', 'rejected', 'completed', 'cancelled');

-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER_ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ SIGN-UP TRIGGER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  chosen_role app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url',
    NEW.phone
  );

  chosen_role := COALESCE((NEW.raw_user_meta_data ->> 'role')::app_role, 'customer'::app_role);
  IF chosen_role = 'admin' THEN chosen_role := 'customer'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, chosen_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ SERVICE CATEGORIES ============
CREATE TABLE public.service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_categories TO anon, authenticated;
GRANT ALL ON public.service_categories TO service_role;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are public" ON public.service_categories FOR SELECT USING (true);
CREATE POLICY "Admins manage categories" ON public.service_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.service_categories (slug, name, icon, sort_order) VALUES
  ('cleaning', 'Cleaning', '🧹', 1),
  ('plumbing', 'Plumbing', '🔧', 2),
  ('electrical', 'Electrical', '⚡', 3),
  ('handyman', 'Handyman', '🛠️', 4),
  ('beauty', 'Beauty & Wellness', '💇', 5),
  ('tutoring', 'Tutoring', '📚', 6),
  ('pet-care', 'Pet Care', '🐾', 7),
  ('moving', 'Moving', '📦', 8),
  ('landscaping', 'Landscaping', '🌿', 9),
  ('auto', 'Auto Repair', '🚗', 10);

-- ============ PROVIDER PROFILES ============
CREATE TABLE public.provider_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  bio TEXT,
  hourly_rate NUMERIC(10,2),
  service_radius_km INT NOT NULL DEFAULT 25,
  address TEXT,
  city TEXT,
  zip TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  phone TEXT,
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  availability_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.provider_profiles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.provider_profiles TO authenticated;
GRANT ALL ON public.provider_profiles TO service_role;
ALTER TABLE public.provider_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active provider profiles are public" ON public.provider_profiles FOR SELECT USING (is_active = true OR auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Providers can create own profile" ON public.provider_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id AND public.has_role(auth.uid(), 'provider'));
CREATE POLICY "Providers can update own profile" ON public.provider_profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can update any provider" ON public.provider_profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER provider_profiles_updated_at BEFORE UPDATE ON public.provider_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PROVIDER CATEGORIES ============
CREATE TABLE public.provider_categories (
  provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.service_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (provider_id, category_id)
);
GRANT SELECT ON public.provider_categories TO anon, authenticated;
GRANT INSERT, DELETE ON public.provider_categories TO authenticated;
GRANT ALL ON public.provider_categories TO service_role;
ALTER TABLE public.provider_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Provider categories are public" ON public.provider_categories FOR SELECT USING (true);
CREATE POLICY "Providers manage own categories" ON public.provider_categories FOR ALL TO authenticated USING (auth.uid() = provider_id) WITH CHECK (auth.uid() = provider_id);

-- ============ BOOKINGS ============
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.service_categories(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_hours NUMERIC(4,2) NOT NULL DEFAULT 1,
  address TEXT NOT NULL,
  notes TEXT,
  status booking_status NOT NULL DEFAULT 'pending',
  total_price NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Booking parties can view" ON public.bookings FOR SELECT TO authenticated USING (auth.uid() = customer_id OR auth.uid() = provider_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Customers create bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Parties update bookings" ON public.bookings FOR UPDATE TO authenticated USING (auth.uid() = customer_id OR auth.uid() = provider_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ REVIEWS ============
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID UNIQUE REFERENCES public.bookings(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reviews are public" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Customers create own reviews" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Customers update own reviews" ON public.reviews FOR UPDATE TO authenticated USING (auth.uid() = customer_id);
CREATE POLICY "Customers delete own reviews" ON public.reviews FOR DELETE TO authenticated USING (auth.uid() = customer_id);
CREATE POLICY "Admins manage reviews" ON public.reviews FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_provider_active ON public.provider_profiles(is_active);
CREATE INDEX idx_bookings_customer ON public.bookings(customer_id, created_at DESC);
CREATE INDEX idx_bookings_provider ON public.bookings(provider_id, created_at DESC);
CREATE INDEX idx_reviews_provider ON public.reviews(provider_id);
