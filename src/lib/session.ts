import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "provider" | "customer";

export async function waitForSupabaseSession(maxAttempts = 6, delayMs = 250) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;
    if (session?.access_token && session.user) return session;

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
}

export async function getSupabaseUserOrNull() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (session?.user) return session.user;

  const { data, error } = await supabase.auth.getUser();
  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    if (message.includes("session") || error.status === 400) return null;
    throw error;
  }

  return data.user ?? null;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });

    const syncSession = async () => {
      try {
        const activeSession = await waitForSupabaseSession(4, 150);
        setSession(activeSession ?? null);
      } catch (error) {
        console.error("Failed to sync Supabase session", error);
        setSession(null);
      } finally {
        setLoading(false);
      }
    };

    void syncSession();
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export function useRoles(user: User | null) {
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

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
