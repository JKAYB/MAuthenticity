import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { AuthShell } from "./login";
import { prefetchMe } from "@/features/auth/hooks";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    try {
      const me = await prefetchMe();
      const target =
        me.must_change_password
          ? "/change-password"
          : (me.planSelected ?? me.plan_selected)
            ? "/dashboard"
            : "/plans";
      console.info("[auth] redirect target", target);
      throw redirect({ to: target as "/dashboard" | "/plans" | "/change-password" });
    } catch (e) {
      if (isRedirect(e)) throw e;
    }
  },
  head: () => ({
    meta: [
      { title: "Create account — MAuthenticity" },
      {
        name: "description",
        content: "Create your MAuthenticity workspace and start verifying media.",
      },
    ],
  }),
  component: () => <AuthShell mode="signup" />,
});
