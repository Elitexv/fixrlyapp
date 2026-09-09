import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/client";
import { Toaster, toast } from "sonner";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { InstallPrompt } from "@/components/InstallPrompt";
import { NetworkStatus } from "@/components/NetworkStatus";

const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("fixrly-theme");var d=s==="dark"||((!s||s==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

// Only ever shown for installed/standalone launches (display-mode: standalone)
// — a plain browser tab already gets real, server-rendered content on first
// paint, so a splash there would just be an artificial delay. For a home
// screen launch, the OS's own native splash (manifest icon + background_color)
// hands off to this the instant our HTML paints, then this hands off to the
// real page once React mounts — same brand orange the whole way through so
// there's no color jump or blank flash in between.
const SPLASH_STYLE = `
#app-splash{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:#ff5a1f;transition:opacity .35s ease;}
#app-splash.app-splash-hide{opacity:0;pointer-events:none;}
@media (display-mode: standalone){#app-splash{display:flex;}}
`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-brand">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-accent/20 hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-accent/20"
          >
            Try again
          </button>
          <a
            href="/"
            className="light-surface rounded-xl border border-border bg-white px-5 py-2.5 text-sm font-medium"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Find local service pros near you — Fixrly" },
      {
        name: "description",
        content:
          "Search vetted local service providers by category and location. Book cleaning, plumbing, tutoring, pet care, and more in your city with Fixrly.",
      },
      { name: "theme-color", content: "#ff5a1f" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Fixrly" },
      { property: "og:site_name", content: "Fixrly" },
      { property: "og:title", content: "Find local service pros near you — Fixrly" },
      {
        property: "og:description",
        content:
          "Search vetted local service providers by category and location. Book cleaning, plumbing, tutoring, pet care, and more in your city with Fixrly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Find local service pros near you — Fixrly" },
      {
        name: "twitter:description",
        content:
          "Search vetted local service providers by category and location. Book cleaning, plumbing, tutoring, pet care, and more in your city with Fixrly.",
      },
      { property: "og:image", content: "https://fixrly.app/og-image.png" },
      { name: "twitter:image", content: "https://fixrly.app/og-image.png" },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Fixrly",
          url: "https://fixrly.app",
          logo: "https://fixrly.app/icon.png",
          description: "A marketplace to find and book vetted local service providers — cleaning, plumbing, tutoring, pet care, and more.",
        },
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/icon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Geist+Mono:wght@500;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: SPLASH_STYLE }} />
        <HeadContent />
      </head>
      <body>
        <div id="app-splash" aria-hidden="true">
          <svg viewBox="0 0 100 100" width="72" height="72" fill="#ffffff">
            <rect x="31" y="23" width="38" height="14" rx="7" />
            <rect x="31" y="41" width="38" height="14" rx="7" />
            <circle cx="38" cy="64" r="7" />
          </svg>
        </div>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // Hand off from the static splash to the real (already-rendered) page
    // once React has mounted. The short delay is a guaranteed minimum
    // display time so a fast launch doesn't just flash the splash for one
    // frame — it's not covering up any real loading work.
    const splash = document.getElementById("app-splash");
    if (!splash) return;
    const timer = setTimeout(() => {
      splash.classList.add("app-splash-hide");
      setTimeout(() => splash.remove(), 400);
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // The Supabase client is configured with the `accessToken` option (see
    // integrations/supabase/client.ts) so it no longer owns session state —
    // calling supabase.auth.onAuthStateChange on a client configured that
    // way throws. Firebase is the actual source of truth for sign-in state.
    let first = true;
    const unsubscribe = onAuthStateChanged(firebaseAuth, () => {
      if (first) {
        first = false;
        return;
      }
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return unsubscribe;
  }, [queryClient, router]);

  // Registration is prod-only: devOptions is off, so no sw.js exists in dev.
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    import("virtual:pwa-register").then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh() {
          toast("A new version of Fixrly is available", {
            action: { label: "Reload", onClick: () => updateSW(true) },
            duration: Infinity,
          });
        },
      });
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <NetworkStatus />
        <Outlet />
        <ThemedToaster />
        <InstallPrompt />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster position="top-center" richColors theme={resolvedTheme} />;
}
