// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

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
});
