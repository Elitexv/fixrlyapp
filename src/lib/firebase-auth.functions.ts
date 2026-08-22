import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Supabase's Third-Party Auth only routes a request to the `authenticated`
// Postgres role if the JWT carries a `role: authenticated` custom claim —
// Firebase doesn't set this on its own. Setting it via a Cloud Function
// would need the project on the Blaze plan; doing it here instead (Admin
// SDK, same verified-token flow as every other protected server fn) avoids
// that dependency entirely. Idempotent — no-ops once the claim is already
// present, so it's safe to call on every sign-in.
export const ensureAuthClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { getFirebaseUserCustomClaims, setFirebaseCustomClaims } = await import("@/integrations/firebase/admin");
      const claims = await getFirebaseUserCustomClaims(context.userId);
      if (claims.role === "authenticated") {
        return { updated: false };
      }
      await setFirebaseCustomClaims(context.userId, { ...claims, role: "authenticated" });
      return { updated: true };
    } catch (err) {
      console.error("[ensureAuthClaim] DEBUG", err instanceof Error ? err.stack : err);
      throw err;
    }
  });
