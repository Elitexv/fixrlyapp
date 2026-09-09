import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";

// Persistent, unmissable banner while the device has no network connection
// at all — distinct from the toast a single failed request gets (see
// notifyNetworkError below), since "you're offline" is a standing condition
// worth stating plainly rather than a one-off popup.
export function NetworkStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    // The initial useState read can catch navigator.onLine mid-flip (e.g.
    // right after page load, before the browser's connectivity check
    // settles) — since nothing actually "transitions" in that case, no
    // online/offline event ever fires to correct it. Resync immediately,
    // and again whenever the tab regains focus, as a defensive backstop.
    const resync = () => setOnline(navigator.onLine);
    resync();

    const goOnline = () => {
      setOnline(true);
      toast.success("Back online");
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", resync);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
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
