// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Enables file-based routes in ./server/routes (e.g. the Paystack webhook),
  // which Nitro doesn't scan by default (serverDir defaults to false).
  // `serverDir` isn't in this wrapper's narrowed nitro option type (it only
  // exposes preset/output/cloudflare) but is forwarded to the real nitro()
  // plugin at runtime regardless, so this cast is safe.
  nitro: {
    serverDir: "server",
  } as any,
  plugins: [
    VitePWA({
      // Nitro points the client build's outDir at .output/public directly
      // (not Vite's "dist" default), so the plugin's own default guess is
      // wrong here — pin it or sw.js/precache end up written nowhere the
      // server actually serves from.
      outDir: ".output/public",
      // TanStack Start renders HTML via RootShell (src/routes/__root.tsx), not a
      // static index.html, so the plugin can't auto-inject the manifest link or
      // register script into HTML. Both are wired up manually there instead.
      injectRegister: null,
      registerType: "prompt",
      includeAssets: ["favicon.ico", "robots.txt"],
      manifest: {
        id: "/",
        name: "Fixrly",
        short_name: "Fixrly",
        description: "Find and book vetted local service providers near you.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#f8fafc",
        theme_color: "#ff5a1f",
        categories: ["business", "lifestyle"],
        icons: [
          { src: "/icon.png", sizes: "48x48", type: "image/png" },
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
        ],
      },
      workbox: {
        // Don't touch navigation/document requests: routes are server-rendered
        // per-request (auth state, booking/payment data), so a cached app-shell
        // fallback would risk showing stale or wrong-user content.
        navigateFallback: null,
        runtimeCaching: [
          {
            // Supabase reads: serve from network, fall back to a short-lived
            // cache so the app stays usable on a flaky connection without
            // showing badly stale booking/payment data.
            urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co"),
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
