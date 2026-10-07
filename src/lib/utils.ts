import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Compact name for tight spots like the top bar's account chip: just the
// first name (e.g. "Elisha Okai" -> "Elisha"), falling back to the email's
// local part. The full name stays available for a tooltip.
export function shortDisplayName(fullName: string | null | undefined, email: string | null | undefined): string {
  const first = fullName?.trim().split(/\s+/)[0];
  return first || email?.split("@")[0] || "Guest";
}
