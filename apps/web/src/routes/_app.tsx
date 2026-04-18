import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { prefetchMe } from "@/features/auth/hooks";
import { getToken } from "@/lib/auth-storage";
import { disableLiveDemo, isLiveDemo } from "@/lib/demo-mode";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    // Authenticated app routes should never stay on marketing demo mock data.
    if (getToken() && isLiveDemo()) {
      disableLiveDemo();
    }
    if (isLiveDemo()) return;
    if (!getToken()) {
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname },
      });
    }
    try {
      await prefetchMe();
    } catch (e) {
      if (isRedirect(e)) throw e;
      if (!getToken()) {
        throw redirect({
          to: "/login",
          search: { redirect: location.pathname },
        });
      }
      throw e;
    }
  },
  component: AppLayout,
});
