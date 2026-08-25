import { useEffect, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/client";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type AppRole = "admin" | "provider" | "customer";

// Everything downstream (profiles.id, bookings.customer_id, RLS policies,
// storage paths, ...) is keyed on `.id` — Firebase's own User object exposes
// this as `.uid` instead. Normalizing here means the rest of the app (10+
// files, dozens of call sites) keeps reading `user.id`/`user.email` exactly
// as it did under Supabase Auth, instead of every one of those needing a
// rename to `.uid`.
export type AppUser = {
  id: string;
  email: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
};

function toAppUser(user: FirebaseUser | null): AppUser | null {
  if (!user) return null;
  return { id: user.uid, email: user.email, getIdToken: (forceRefresh) => user.getIdToken(forceRefresh) };
}

/**
 * Only allow same-app relative paths as a post-login redirect target.
 * `"//evil.com".startsWith("/")` is true — a bare startsWith("/") check lets
 * a crafted `?redirect=//evil.com` (or `/\evil.com`, which browsers treat
 * the same way) send a freshly-authenticated user off-site, a classic open
 * redirect used to make phishing pages look like they follow a real login.
 */
export function safeRedirectPath(redirect: string | null | undefined): string {
  if (!redirect) return "/";
  if (!redirect.startsWith("/") || redirect.startsWith("//") || redirect.startsWith("/\\")) return "/";
  return redirect;
}

// Firebase's SDK restores a persisted session from IndexedDB asynchronously,
// so `firebaseAuth.currentUser` can be momentarily null on first load even
// when the user is actually signed in. Resolving on the *first*
// onAuthStateChanged callback is the standard way to get the settled value
// once, without the polling this replaced (Supabase's local-storage session
// sync had a similar race, worked around with retry-loop polling).
export function getFirebaseUserOrNull(): Promise<AppUser | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      unsubscribe();
      resolve(toAppUser(user));
    });
  });
}

export function useSession() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      setUser(toAppUser(firebaseUser));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, loading };
}

export function useRoles(user: AppUser | null) {
  return useQuery({
    queryKey: ["roles", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
}

export type MyBusiness = { providerId: string; role: "owner" | "dispatcher" | "technician" };

// Resolves which provider business (if any) the current user acts for: the
// one they own (their own provider_profiles row), or one they're an active
// staff member of. A user can own at most one business today and — for
// this first slice — is assumed to staff at most one too, so this returns
// a single business rather than a list.
export function useMyBusiness(user: AppUser | null, roles: AppRole[] | undefined) {
  const isProvider = !!roles?.includes("provider");
  return useQuery({
    queryKey: ["my-business", user?.id, isProvider],
    enabled: !!user,
    queryFn: async (): Promise<MyBusiness | null> => {
      if (isProvider) {
        const { data, error } = await supabase.from("provider_profiles").select("id").eq("id", user!.id).maybeSingle();
        if (error) throw error;
        if (data) return { providerId: data.id, role: "owner" };
      }
      const { data: staffRow, error: staffError } = await supabase
        .from("provider_staff")
        .select("provider_id,role")
        .eq("staff_user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (staffError) throw staffError;
      if (staffRow) return { providerId: staffRow.provider_id, role: staffRow.role as "dispatcher" | "technician" };
      return null;
    },
  });
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
