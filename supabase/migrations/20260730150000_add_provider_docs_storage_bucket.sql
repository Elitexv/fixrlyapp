-- The provider-docs bucket was referenced by storage.objects RLS policies
-- (see 20260712120322_...) but the bucket itself was never created, so every
-- upload failed with "Bucket not found". IDs/documents stay private — access
-- is via short-lived signed URLs only (see admin.tsx RequestsTab).
INSERT INTO storage.buckets (id, name, public)
VALUES ('provider-docs', 'provider-docs', false)
ON CONFLICT (id) DO NOTHING;
