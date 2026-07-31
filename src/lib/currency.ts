import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SYMBOLS: Record<string, string> = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
  GHS: "₵",
  KES: "KSh",
  ZAR: "R",
  CAD: "$",
  AUD: "$",
};

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? `${code} `;
}

export function formatMoney(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(Number(amount));
  } catch {
    return `${currencySymbol(currency)}${Number(amount).toFixed(0)}`;
  }
}

export function useCurrency(): string {
  const { data } = useQuery({
    queryKey: ["app-currency"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_settings" as any)
        .select("currency")
        .eq("id", "payments")
        .maybeSingle();
      if (error) throw error;
      return (data as any)?.currency ?? "NGN";
    },
    staleTime: 5 * 60 * 1000,
  });
  return data ?? "NGN";
}
