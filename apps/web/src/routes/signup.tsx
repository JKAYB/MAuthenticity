import { createFileRoute } from "@tanstack/react-router";
import { AuthShell } from "./login";

export const Route = createFileRoute("/signup")({
  validateSearch: (
    search: Record<string, unknown>
  ): {
    redirect?: string;
    inviteToken?: string;
    inviteEmail?: string;
    inviteAction?: string;
    lockEmail?: string;
  } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    inviteToken: typeof search.inviteToken === "string" ? search.inviteToken : undefined,
    inviteEmail: typeof search.inviteEmail === "string" ? search.inviteEmail : undefined,
    inviteAction: typeof search.inviteAction === "string" ? search.inviteAction : undefined,
    lockEmail: typeof search.lockEmail === "string" ? search.lockEmail : undefined,
  }),
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
