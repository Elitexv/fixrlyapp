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
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "sonner";
import { ThemeProvider, useTheme } from "@/lib/theme";

const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("fixrly-theme");var d=s==="dark"||((!s||s==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

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
          <Link to="/" className="inline-flex items-center rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-accent/20 hover:opacity-90">
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
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-accent/20"
          >Try again</button>
          <a href="/" className="light-surface rounded-xl border border-border bg-white px-5 py-2.5 text-sm font-medium">Go home</a>
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
      { name: "description", content: "Search vetted local service providers by category and location. Book cleaning, plumbing, tutoring, pet care, and more in your city with Fixrly." },
      { name: "theme-color", content: "#ff5a1f" },
      { property: "og:site_name", content: "Fixrly" },
      { property: "og:title", content: "Find local service pros near you — Fixrly" },
      { property: "og:description", content: "Search vetted local service providers by category and location. Book cleaning, plumbing, tutoring, pet care, and more in your city with Fixrly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Find local service pros near you — Fixrly" },
      { name: "twitter:description", content: "Search vetted local service providers by category and location. Book cleaning, plumbing, tutoring, pet care, and more in your city with Fixrly." },
      { property: "og:image", content: "https://fixrly.app/og-image.png" },
      { name: "twitter:image", content: "https://fixrly.app/og-image.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/icon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Geist+Mono:wght@500;700&display=swap" },
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
        <HeadContent />
      </head>
      <body>
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
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Outlet />
        <ThemedToaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster position="top-center" richColors theme={resolvedTheme} />;
}
