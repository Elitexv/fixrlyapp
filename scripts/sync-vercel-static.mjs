// Nitro's Vercel preset packages `.vercel/output/static` from `.output/public`
// as part of the build — but vite-plugin-pwa writes sw.js/workbox-*.js in its
// own closeBundle hook, which runs after that packaging step finishes. Those
// files exist on disk in `.output/public` but never make it into the actual
// deployed static output, so the service worker 404s in production and
// registration silently fails app-wide. Reconcile the two directories after
// the build so nothing generated late gets left behind.
import { existsSync, readdirSync, copyFileSync, statSync, cpSync } from "node:fs";
import { join } from "node:path";

const SRC = ".output/public";
const DEST = ".vercel/output/static";

if (!existsSync(DEST)) {
  // Not a Vercel build (e.g. plain `npm run build` locally) — nothing to sync.
  process.exit(0);
}

if (!existsSync(SRC)) {
  console.warn(`[sync-vercel-static] ${SRC} not found, skipping`);
  process.exit(0);
}

let copied = 0;
for (const name of readdirSync(SRC)) {
  const srcPath = join(SRC, name);
  const destPath = join(DEST, name);
  if (existsSync(destPath)) continue;
  if (name === "_headers") continue; // Cloudflare Pages convention, meaningless on Vercel
  if (statSync(srcPath).isDirectory()) cpSync(srcPath, destPath, { recursive: true });
  else copyFileSync(srcPath, destPath);
  copied++;
  console.log(`[sync-vercel-static] copied missing ${name}`);
}

if (copied === 0) console.log("[sync-vercel-static] nothing missing, all good");
