import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles, useSession } from "@/lib/session";
import { NotificationsBell } from "@/components/NotificationsBell";
import { shortDisplayName } from "@/lib/utils";

// Desktop (lg+) top bar for pages other than home: a search box that hands
// the query to the home page's provider search, plus notifications and the
// signed-in user. Home renders its own richer version with live results.
export function AppTopBar() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { data: roles = [] } = useRoles(user);
  const [query, setQuery] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("avatar_url,full_name").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const fullName = profile?.full_name || user?.email?.split("@")[0] || "Guest";
  const displayName = shortDisplayName(profile?.full_name, user?.email);
  const roleLabel = roles.includes("admin") ? "Admin" : roles.includes("provider") ? "Provider" : "User";

  return (
    <header className="sticky top-0 z-30 hidden border-b border-soft bg-surface/90 backdrop-blur-xl lg:block">
      <div className="mx-auto flex max-w-[1240px] items-center gap-6 px-6 py-4">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/", search: query.trim() ? { q: query.trim() } : {} });
          }}
          className="flex max-w-[800px] flex-1 items-center gap-3 rounded-full border border-soft bg-surface px-4 py-2.5 shadow-sm transition focus-within:border-accent/40 focus-within:ring-4 focus-within:ring-accent/10"
        >
          <Search className="size-[18px] shrink-0 text-brand/45" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for cleaning, plumbing, tutoring, etc..."
            aria-label="Search services"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-brand/45"
          />
          <button type="submit" aria-label="Search" className="grid size-8 place-items-center rounded-full text-brand/60 transition hover:bg-brand/5">
            <SlidersHorizontal className="size-[18px]" />
          </button>
        </form>
        <div className="ml-auto flex items-center gap-4">
          <NotificationsBell />
          {user ? (
            <button
              type="button"
              onClick={() => navigate({ to: "/profile" })}
              aria-label="Your profile"
              className="flex items-center gap-3 rounded-full p-0.5 pr-2 transition hover:bg-brand/5"
            >
              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[#0b1730] text-base font-semibold text-white">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  displayName[0]?.toUpperCase()
                )}
              </span>
              <span className="text-left">
                <span title={fullName} className="block max-w-[8rem] truncate text-sm font-semibold">{displayName}</span>
                <span className="block text-xs text-brand/50">{roleLabel}</span>
              </span>
              <ChevronDown className="size-4 text-brand/50" />
            </button>
          ) : (
            <Link to="/auth" className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-orange-500">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
