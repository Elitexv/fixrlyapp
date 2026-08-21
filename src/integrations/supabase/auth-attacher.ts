// Hand-maintained since the Firebase Auth swap — attaches the current
// Firebase ID token to server-fn RPCs instead of a Supabase session token.
// Registered as a global `functionMiddleware` in `src/start.ts`; otherwise
// the browser never attaches the bearer token to serverFn RPCs.
import { createMiddleware } from '@tanstack/react-start'
import { firebaseAuth } from '@/integrations/firebase/client'

export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    const token = await firebaseAuth.currentUser?.getIdToken()
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  },
)
