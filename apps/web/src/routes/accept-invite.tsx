import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { acceptTeamInvite, declineTeamInvite } from "@/lib/api";
import { useMe } from "@/features/auth/hooks";

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (raw: Record<string, unknown>): { token?: string } => ({
    token: typeof raw.token === "string" ? raw.token : undefined,
  }),
  head: () => ({ meta: [{ title: "Accept invitation — Observyx" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const meQuery = useMe();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  if (!token) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Invalid invite link</h1>
        <p className="text-sm text-muted-foreground">The invitation token is missing.</p>
      </div>
    );
  }

  const redirectTo = `/accept-invite?token=${encodeURIComponent(token)}`;
  const loggedIn = Boolean(meQuery.data);

  const onAccept = async () => {
    if (!loggedIn) {
      navigate({ to: "/login", search: { redirect: redirectTo } });
      return;
    }
    setBusy("accept");
    try {
      await acceptTeamInvite(token);
      toast.success("Invitation accepted.");
      await navigate({ to: "/team" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept invite");
    } finally {
      setBusy(null);
    }
  };

  const onDecline = async () => {
    setBusy("decline");
    try {
      await declineTeamInvite(token);
      toast.success("Invitation declined.");
      await navigate({ to: loggedIn ? "/dashboard" : "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to decline invite");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 py-16">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-xl">
        <h1 className="font-display text-2xl font-semibold">Team invitation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Accept this invitation to join your team workspace.
        </p>
        {!loggedIn ? (
          <p className="mt-3 text-xs text-muted-foreground">
            You need to sign in with the invited email before accepting.
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void onAccept()}
            className="inline-flex h-9 items-center rounded-lg bg-gradient-to-br from-primary to-accent px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy === "accept" ? "Accepting..." : "Accept invitation"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void onDecline()}
            className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground disabled:opacity-60"
          >
            {busy === "decline" ? "Declining..." : "Decline"}
          </button>
          {!loggedIn ? (
            <Link
              to="/signup"
              search={{ redirect: redirectTo }}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground"
            >
              Create account
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
