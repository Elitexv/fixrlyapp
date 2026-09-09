import { useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";

// Persistent, unmissable banner while the device has no network connection
// at all — distinct from the toast a single failed request gets (see
// notifyNetworkError below), since "you're offline" is a standing condition
// worth stating plainly rather than a one-off popup.
export function NetworkStatus() {
  const [online, setOnline] = useState(true);
  const offlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (offlineTimer.current) {
        clearTimeout(offlineTimer.current);
        offlineTimer.current = null;
      }
    };

    // navigator.onLine can report a stale/wrong value for a brief window
    // right after a cold launch, before the OS network stack finishes
    // settling — and since nothing "transitions" in that case, no
    // online/offline event fires to correct it. So never trust a single
    // reading: debounce "offline" for a moment and re-check navigator.onLine
    // when the timer fires, rather than acting on what it said 600ms ago.
    const goOffline = () => {
      clearTimer();
      offlineTimer.current = setTimeout(() => {
        if (!navigator.onLine) setOnline(false);
      }, 600);
    };
    const goOnline = (announce: boolean) => {
      clearTimer();
      setOnline((wasOnline) => {
        if (!wasOnline && announce) toast.success("Back online");
        return true;
      });
    };
    const resync = () => (navigator.onLine ? goOnline(true) : goOffline());
    resync();

    const onOnlineEvent = () => goOnline(true);
    const onOfflineEvent = () => goOffline();
    window.addEventListener("online", onOnlineEvent);
    window.addEventListener("offline", onOfflineEvent);
    document.addEventListener("visibilitychange", resync);
    return () => {
      clearTimer();
      window.removeEventListener("online", onOnlineEvent);
      window.removeEventListener("offline", onOfflineEvent);
      document.removeEventListener("visibilitychange", resync);
    };
  }, []);

  if (online) return null;

  return (
    // Deliberately the literal navy, not bg-brand — --brand flips to white
    // in dark mode (it's a text-color token), which turned this into an
    // invisible white-on-white bar there.
    <div className="fixed inset-x-0 top-0 z-[150] flex items-center justify-center gap-2 bg-[#0f172a] px-4 py-2 text-center text-xs font-semibold text-white">
      <WifiOff className="size-3.5 shrink-0" />
      You're offline — check your connection. We'll keep trying.
    </div>
  );
}

// Best-effort classification of a React Query error as "the request never
// reached the server" (DNS down, no signal, host unreachable) rather than a
// normal application error (validation, permission, not-found) — those
// already show their own specific toasts at the call site and shouldn't be
// double-reported here.
function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|network ?error|load failed|networkerror|err_internet|err_network|err_connection/i.test(message);
}

let lastNetworkToastAt = 0;

// Called from the QueryCache's global onError (see router.tsx) — throttled
// so one bad connection doesn't pop a toast per failed query.
export function notifyNetworkError(error: unknown) {
  // getRouter() (router.tsx) runs during SSR too, where sonner has no DOM
  // to render into — only ever toast from the browser.
  if (typeof window === "undefined") return;
  if (!isNetworkError(error)) return;
  const now = Date.now();
  if (now - lastNetworkToastAt < 10_000) return;
  lastNetworkToastAt = now;
  toast.error("Network error — check your connection and try again");
}
