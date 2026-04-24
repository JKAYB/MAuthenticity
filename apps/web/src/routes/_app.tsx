import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { prefetchMe } from "@/features/auth/hooks";
import { disableLiveDemo, isLiveDemo } from "@/lib/demo-mode";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    if (isLiveDemo()) return;
    try {
      await prefetchMe();
      disableLiveDemo();
    } catch (e) {
      if (isRedirect(e)) throw e;
      console.info("[auth] redirect target", "/login");
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname },
      });
    }
  },
  component: AppLayout,
});
