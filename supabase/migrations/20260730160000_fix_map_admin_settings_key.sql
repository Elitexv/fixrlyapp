-- The admin_settings 'map' row had been set to a Geocoding-only API key, which
-- GoogleMap.tsx prefers over the VITE_ browser key env var, breaking the map
-- display with ApiTargetBlockedMapError (key not authorized for Maps JavaScript API).
-- Point it at the key actually provisioned for the Maps JavaScript API.
INSERT INTO public.admin_settings (id, provider, mode, publishable_key, currency, platform_fee_percent, payment_enabled)
VALUES ('map', 'google_maps', 'live', 'AIzaSyAZcqxiH2Qr3EtycSE71vV8CIz80XcFing', 'NGN', 0, false)
ON CONFLICT (id) DO UPDATE SET publishable_key = EXCLUDED.publishable_key;
