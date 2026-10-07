import {
  SprayCan,
  Wrench,
  Zap,
  Hammer,
  GraduationCap,
  Flower2,
  Package,
  PawPrint,
  Leaf,
  Car,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Visual = { icon: LucideIcon; color: string; tint: string; tagline: string };

// Categories live in the database (slug + emoji icon); this gives the known
// ones a consistent colored line icon and a short tagline for the home page
// tiles. Unknown slugs fall back to the category's own emoji.
const VISUALS: Record<string, Visual> = {
  cleaning: { icon: SprayCan, color: "text-orange-500", tint: "from-orange-100 to-amber-50", tagline: "Home & Office" },
  plumbing: { icon: Wrench, color: "text-blue-600", tint: "from-blue-100 to-sky-50", tagline: "Repairs & Installation" },
  electrical: { icon: Zap, color: "text-orange-500", tint: "from-amber-100 to-yellow-50", tagline: "Wiring & Repairs" },
  handyman: { icon: Hammer, color: "text-slate-700 dark:text-slate-300", tint: "from-slate-200 to-slate-50", tagline: "General Repairs" },
  tutoring: { icon: GraduationCap, color: "text-violet-600", tint: "from-violet-100 to-purple-50", tagline: "Academic Support" },
  beauty: { icon: Flower2, color: "text-pink-500", tint: "from-pink-100 to-rose-50", tagline: "Hair & Skincare" },
  "pet-care": { icon: PawPrint, color: "text-amber-600", tint: "from-amber-100 to-orange-50", tagline: "Walking & Grooming" },
  moving: { icon: Truck, color: "text-indigo-600", tint: "from-indigo-100 to-blue-50", tagline: "Packing & Transport" },
  delivery: { icon: Package, color: "text-orange-600", tint: "from-orange-100 to-amber-50", tagline: "Pickup & Drop-off" },
  landscaping: { icon: Leaf, color: "text-green-600", tint: "from-green-100 to-emerald-50", tagline: "Gardens & Lawns" },
  auto: { icon: Car, color: "text-red-500", tint: "from-red-100 to-orange-50", tagline: "Servicing & Repairs" },
};

export function categoryVisual(slug: string): Visual | null {
  return VISUALS[slug] ?? null;
}

export function CategoryIcon({ slug, emoji, className }: { slug: string; emoji: string | null; className?: string }) {
  const v = categoryVisual(slug);
  if (!v) return <span className={cn("text-2xl leading-none", className)} aria-hidden="true">{emoji ?? "🛠️"}</span>;
  const Icon = v.icon;
  return <Icon className={cn(v.color, className)} strokeWidth={2.2} aria-hidden="true" />;
}
