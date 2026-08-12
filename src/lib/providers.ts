import { supabase } from "@/integrations/supabase/client";
import type { ProviderCardData } from "@/components/ProviderCard";

export type Category = { id: string; slug: string; name: string; icon: string | null };

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from("service_categories").select("id,slug,name,icon").order("sort_order");
  if (error) throw error;
  return data as Category[];
}

export async function fetchCategoryBySlug(slug: string): Promise<Category | null> {
  const { data, error } = await supabase.from("service_categories").select("id,slug,name,icon").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as Category | null;
}

/**
 * Shared by the homepage and the /services/$categorySlug landing pages so
 * both the client-side query and the SSR route loader that seeds it stay in
 * lockstep — same shape, same filtering — instead of two hand-maintained
 * copies drifting apart.
 */
export async function fetchActiveProviders(categoryId?: string | null): Promise<(ProviderCardData & { _cat_ids: string[] })[]> {
  const { data, error } = await supabase
    .from("provider_profiles")
    .select(
      "id,business_name,bio,hourly_rate,city,photo_urls,availability_note,latitude,longitude,provider_categories(category_id,service_categories(name)),reviews(rating)",
    )
    .eq("is_active", true);
  if (error) throw error;

  const ids = (data ?? []).map((row: any) => row.id);
  let avatarMap = new Map<string, string | null>();
  if (ids.length) {
    const { data: profs } = await supabase.from("profiles").select("id,avatar_url").in("id", ids);
    avatarMap = new Map((profs ?? []).map((p: any) => [p.id, p.avatar_url]));
  }

  let rows = (data ?? []).map((row: any) => {
    const ratings: number[] = (row.reviews ?? []).map((r: any) => r.rating);
    const rating = ratings.length ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : null;
    const category_names: string[] = (row.provider_categories ?? []).map((pc: any) => pc.service_categories?.name).filter(Boolean);
    return {
      id: row.id,
      business_name: row.business_name,
      bio: row.bio,
      hourly_rate: row.hourly_rate,
      city: row.city,
      photo_urls: row.photo_urls ?? [],
      avatar_url: avatarMap.get(row.id) ?? null,
      availability_note: row.availability_note,
      category_names,
      rating,
      review_count: ratings.length,
      distance_km: null,
      latitude: row.latitude,
      longitude: row.longitude,
      _cat_ids: (row.provider_categories ?? []).map((pc: any) => pc.category_id) as string[],
    };
  });

  if (categoryId) rows = rows.filter((r) => r._cat_ids.includes(categoryId));
  return rows as any;
}
