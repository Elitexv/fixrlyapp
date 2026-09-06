import { useRouterState } from "@tanstack/react-router";

// Thin, unified loading indicator for the whole app — shown whenever the
// router is navigating or a route's loader is still fetching data, so every
// page transition gets the same feedback instead of each route inventing
// its own (or showing nothing at all while a slow loader runs).
export function TopLoader() {
  const isLoading = useRouterState({ select: (s) => s.status === "pending" });

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px] overflow-hidden bg-accent/15 transition-opacity duration-300 ${
        isLoading ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="top-loader-bar h-full w-1/3 rounded-full bg-accent" />
    </div>
  );
}
