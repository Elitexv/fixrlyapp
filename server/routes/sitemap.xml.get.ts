import { defineHandler } from "nitro";
import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://fixrly.app";

function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
}

export default defineHandler(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;

  const staticUrls = [
    { loc: `${SITE_URL}/`, changefreq: "daily", priority: "1.0" },
  ];

  let providerUrls: { loc: string; lastmod: string; changefreq: string; priority: string }[] = [];
  let categoryUrls: { loc: string; changefreq: string; priority: string }[] = [];

  if (url && key) {
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      const [{ data: providers }, { data: categories }] = await Promise.all([
        supabase
          .from("provider_profiles")
          .select("id,updated_at")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(5000),
        supabase.from("service_categories").select("slug"),
      ]);
      providerUrls = (providers ?? []).map((p) => ({
        loc: `${SITE_URL}/provider/${p.id}`,
        lastmod: new Date(p.updated_at).toISOString(),
        changefreq: "weekly",
        priority: "0.8",
      }));
      categoryUrls = (categories ?? []).map((c) => ({
        loc: `${SITE_URL}/services/${c.slug}`,
        changefreq: "daily",
        priority: "0.9",
      }));
    } catch (err) {
      console.error("[sitemap] Failed to load providers/categories", err);
    }
  }

  const entries = [
    ...staticUrls.map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`),
    ...categoryUrls.map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`),
    ...providerUrls.map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
});
