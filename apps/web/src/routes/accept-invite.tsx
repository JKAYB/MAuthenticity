import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { acceptTeamInvite, declineTeamInvite, lookupTeamInvite, logoutRequest } from "@/lib/api";
import { meQueryKey, useMe } from "@/features/auth/hooks";

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (raw: Record<string, unknown>): { token?: string; action?: "accept" | "decline" } => ({
    token: typeof raw.token === "string" ? raw.token : undefined,
    action: raw.action === "decline" ? "decline" : "accept",
  }),
  head: () => ({ meta: [{ title: "Accept invitation — MAuthenticity" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token, action = "accept" } = Route.useSearch();
  const navigate = useNavigate();
  const meQuery = useMe();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<"working" | "mismatch" | "done" | "error">("working");
  const [message, setMessage] = useState("Validating invitation…");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const previewToken = token ? `${token.slice(0, 6)}...${token.slice(-6)}` : "(empty)";

  if (!token) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Invalid invite link</h1>
        <p className="text-sm text-muted-foreground">The invitation token is missing.</p>
      </div>
    );
  }

  const loggedIn = Boolean(meQuery.data);

  useEffect(() => {
    console.info("[accept-invite] mounted", {
      action,
      token: previewToken,
      loggedIn,
    });
    let cancelled = false;
    async function run() {
      try {
        if (action === "decline") {
          setMessage("Declining invitation…");
          await declineTeamInvite(token);
          if (cancelled) return;
          setPhase("done");
          setMessage("Invitation declined.");
          toast.success("Invitation declined.");
          await navigate({ to: loggedIn ? "/dashboard" : "/" });
          return;
        }

        setMessage("Validating invitation…");
        const lookup = await lookupTeamInvite(token);
        if (cancelled) return;
        setInviteEmail(lookup.invite.email);

        if (!loggedIn) {
          const redirectTo = `/accept-invite?token=${encodeURIComponent(token)}&action=accept`;
          if (lookup.hasAccount) {
            await navigate({
              to: "/login",
              search: {
                redirect: redirectTo,
                inviteToken: token,
                inviteEmail: lookup.invite.email,
                inviteAction: "accept",
              },
            });
            return;
          }
          await navigate({
            to: "/signup",
            search: {
              redirect: redirectTo,
              inviteToken: token,
              inviteEmail: lookup.invite.email,
              inviteAction: "accept",
              lockEmail: "1",
            },
          });
          return;
        }
        const meEmail = String(meQuery.data?.email || "");
        setSignedInEmail(meEmail || null);
        if (meEmail.toLowerCase() !== String(lookup.invite.email).toLowerCase()) {
          setPhase("mismatch");
          setMessage("Invitation account mismatch.");
          return;
        }

        setMessage("Accepting invitation…");
        await acceptTeamInvite(token);
        if (cancelled) return;
        setPhase("done");
        setMessage("Invitation accepted.");
        toast.success("Invitation accepted.");
        await navigate({ to: "/team" });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Failed to process invitation";
        setPhase("error");
        setErrorMessage(msg);
        toast.error(msg);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [action, loggedIn, meQuery.data?.email, navigate, token]);

  const onSignOutAndContinue = async () => {
    setSigningOut(true);
    try {
      await logoutRequest();
    } finally {
      qc.removeQueries({ queryKey: meQueryKey });
      await navigate({
        to: "/accept-invite",
        search: { token, action: "accept" },
        replace: true,
      });
      setSigningOut(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 py-16">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-xl">
        <h1 className="font-display text-2xl font-semibold">Team invitation</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {phase === "working" ? <p className="mt-3 text-xs text-muted-foreground">Please wait…</p> : null}
        {phase === "mismatch" ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              This invitation was sent to {inviteEmail || "the invited email"}. You are currently signed in as{" "}
              {signedInEmail || "another account"}.
            </p>
            <button
              type="button"
              onClick={() => void onSignOutAndContinue()}
              disabled={signingOut}
              className="inline-flex h-9 items-center rounded-lg bg-gradient-to-br from-primary to-accent px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {signingOut ? "Signing out..." : "Sign out and continue"}
            </button>
          </div>
        ) : null}
        {phase === "error" ? (
          <p className="mt-3 text-xs text-destructive">
            {errorMessage || "This invitation could not be processed."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
