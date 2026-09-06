// Canonical Fixrly mark, as vector — the only source of truth for every
// rendered instance (inline UI, favicon, PWA/home-screen icons). Rendering
// from this instead of scaling a raster image is what keeps it crisp at
// every size.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" aria-hidden="true">
      <rect x="31" y="23" width="38" height="14" rx="7" />
      <rect x="31" y="41" width="38" height="14" rx="7" />
      <circle cx="38" cy="64" r="7" />
    </svg>
  );
}
