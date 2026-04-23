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
      await prefetchMe();
      throw redirect({ to: "/dashboard" });
    } catch (e) {
      if (isRedirect(e)) throw e;
    }
  },
  head: () => ({
    meta: [
      { title: "Create account — Observyx" },
      {
        name: "description",
        content: "Create your Observyx workspace and start verifying media.",
      },
    ],
  }),
  component: () => <AuthShell mode="signup" />,
});
