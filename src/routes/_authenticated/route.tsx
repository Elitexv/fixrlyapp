import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getFirebaseUserOrNull } from "@/lib/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const user = await getFirebaseUserOrNull();
    if (!user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user };
  },
  component: () => <Outlet />,
});
