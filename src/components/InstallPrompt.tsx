import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "fixrly-install-dismissed";
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
// Don't distract visitors mid auth or mid checkout.
const EXCLUDED_PATH_PREFIXES = ["/auth", "/book/"];

function recentlyDismissed() {
  const at = localStorage.getItem(DISMISS_KEY);
  return at !== null && Date.now() - Number(at) < DISMISS_COOLDOWN_MS;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    const onAppInstalled = () => {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      setDeferredPrompt(null);
      setShowIosHint(false);
    };
    window.addEventListener("appinstalled", onAppInstalled);

    // Safari on iOS has no beforeinstallprompt API, so fall back to
    // "Share > Add to Home Screen" instructions after a short delay. Excludes
    // in-app browsers (Instagram/Facebook/etc.) that can't install at all.
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) && !("MSStream" in window);
    const isRealSafari = /safari/i.test(ua) && !/crios|fxios|edgios|instagram|fban|fbav/i.test(ua);
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIos && isRealSafari) {
      iosTimer = setTimeout(() => setShowIosHint(true), 2500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome !== "accepted") localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const visible = (deferredPrompt !== null || showIosHint) && !dismissed;
  if (!visible || EXCLUDED_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className="fixed inset-x-4 bottom-20 z-40 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-xl shadow-black/10 dark:border-white/10 dark:bg-neutral-900">
        <img src="/pwa-192x192.png" alt="" className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Get the Fixrly app</p>
          {showIosHint ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Tap <Share className="inline size-3.5 -translate-y-px" aria-hidden />{" "}
              <span className="font-medium">Share</span>, then{" "}
              <SquarePlus className="inline size-3.5 -translate-y-px" aria-hidden />{" "}
              <span className="font-medium">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Install Fixrly for faster access and a full-screen experience.
            </p>
          )}
          {!showIosHint && (
            <Button
              size="sm"
              className="mt-3 h-8 bg-accent text-white hover:bg-accent/90"
              onClick={install}
            >
              <Download className="size-3.5" />
              Install
            </Button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
