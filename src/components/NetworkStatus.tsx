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
    const goOnline = () => {
      setOnline(true);
      toast.success("Back online");
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[150] flex items-center justify-center gap-2 bg-brand px-4 py-2 text-center text-xs font-semibold text-white">
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
