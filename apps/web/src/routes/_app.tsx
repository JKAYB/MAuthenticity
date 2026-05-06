import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { prefetchMe } from "@/features/auth/hooks";
import { hasCompletedOnboarding } from "@/features/auth/onboarding";
import { disableLiveDemo, isLiveDemo } from "@/lib/demo-mode";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    if (isLiveDemo()) return;
    try {
      const me = await prefetchMe();
      const onboardingComplete = hasCompletedOnboarding(me);
      if (me.must_change_password && location.pathname !== "/change-password") {
        console.info("[auth] redirect target", "/change-password");
        throw redirect({ to: "/change-password" });
      }
      if (!onboardingComplete && location.pathname !== "/plans") {
        console.info("[auth] redirect target", "/plans");
        throw redirect({ to: "/plans" });
      }
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
