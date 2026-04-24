import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { addTeamMember, getMyTeam, removeTeamMember, resendTeamInvite } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Mail, UserPlus, Users, Trash2, RefreshCw } from "lucide-react";
import { SectionHeader } from "@/components/ui-ext/SectionHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/team")({
  head: () => ({ meta: [{ title: "Team — Observyx" }] }),
  component: TeamPage,
});

function TeamPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusyId, setResendBusyId] = useState<string | null>(null);
  const [removePending, setRemovePending] = useState<{ id: string; email: string } | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const qc = useQueryClient();
  const teamQuery = useQuery({
    queryKey: ["team", "me"],
    queryFn: getMyTeam,
  });

  const onAdd = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await addTeamMember(email.trim());
      toast.success("Invitation sent.");
      setEmail("");
      await qc.invalidateQueries({ queryKey: ["team", "me"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setBusy(false);
    }
  };

  const onResend = async (inviteId: string) => {
    setResendBusyId(inviteId);
    try {
      await resendTeamInvite(inviteId);
      toast.success("Invitation sent.");
      await qc.invalidateQueries({ queryKey: ["team", "me"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resend invitation");
    } finally {
      setResendBusyId(null);
    }
  };

  const onRemove = async (userId: string, memberEmail: string) => {
    setRemovePending({ id: userId, email: memberEmail });
  };

  const confirmRemove = async () => {
    if (!removePending) return;
    setRemoveBusy(true);
    try {
      await removeTeamMember(removePending.id);
      await qc.invalidateQueries({ queryKey: ["team", "me"] });
      toast.success("Member removed from team.");
      setRemovePending(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setRemoveBusy(false);
    }
  };

  if (teamQuery.isPending) return <div className="text-sm text-muted-foreground">Loading team…</div>;
  if (teamQuery.isError) return <div className="text-sm text-destructive">{teamQuery.error.message}</div>;

  const role = teamQuery.data.role;
  if (role !== "team_owner") {
    return <div className="text-sm text-muted-foreground">Only team owners can manage members.</div>;
  }

  return (
    <div className="mx-auto min-w-0 max-w-full space-y-6">
      <SectionHeader
        eyebrow="Team"
        title="Management"
        description="Add or remove team members from your workspace." />
      <div className="space-y-6">
         {/* Add member form */}
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Invite by email
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="member@company.com"
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                type="button"
                onClick={() => void onAdd()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-primary to-accent px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                Add member
              </button>
            </div>
          </div>
        {/* Members list */}
        <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Members
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {(teamQuery.data.members || []).length}
                </span>
              </h3>
            </div>

            {(teamQuery.data.members || []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No team members yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {(teamQuery.data.members || []).map((m) => {
                  const initial = m.email.charAt(0).toUpperCase();
                  const ready = !m.must_change_password;
                  return (
                    <li
                      key={m.id}
                      className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 text-sm font-semibold text-foreground">
                        {initial}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {m.email}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="capitalize">{m.role}</span>
                          <span className="text-border">•</span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${ready
                              ? "bg-primary/10 text-primary"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-primary" : "bg-amber-500"
                                }`}
                            />
                            {ready ? "Ready" : "Must change password"}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void onRemove(m.id, m.email)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

        {/* Invitations */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Invitations
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {teamQuery.data.invites.length}
              </span>
            </h3>
          </div>
          {teamQuery.data.invites.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No invitations.
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {teamQuery.data.invites.map((inv) => {
                const canResend = inv.status === "pending" || inv.status === "declined" || inv.status === "expired";
                const statusLabel =
                  inv.status === "pending"
                    ? "Invitation sent"
                    : inv.status === "accepted"
                      ? "Invitation accepted"
                      : inv.status === "declined"
                        ? "Invitation declined"
                        : inv.status === "expired"
                          ? "Invitation expired"
                          : "Invitation revoked";
                return (
                  <li key={inv.id} className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 text-sm font-semibold text-foreground">
                      {inv.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{inv.email}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{statusLabel}</span>
                        {inv.expires_at ? (
                          <>
                            <span className="text-border">•</span>
                            <span>Expires {new Date(inv.expires_at).toLocaleString()}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {canResend ? (
                      <button
                        type="button"
                        disabled={resendBusyId === inv.id}
                        onClick={() => void onResend(inv.id)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary disabled:opacity-60"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {resendBusyId === inv.id ? "Sending..." : "Resend"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

      </div>
      <AlertDialog open={Boolean(removePending)} onOpenChange={(open) => !open && setRemovePending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removePending
                ? `This will remove ${removePending.email} from your team workspace.`
                : "This will remove the selected member from your team workspace."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeBusy}
              onClick={(e) => {
                e.preventDefault();
                void confirmRemove();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeBusy ? "Removing..." : "Remove member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    // <div className="mx-auto max-w-3xl space-y-6">
    //   <div>
    //     <h1 className="font-display text-3xl font-semibold">Team management</h1>
    //     <p className="mt-2 text-sm text-muted-foreground">Add or remove team members.</p>
    //   </div>
    //   <div className="rounded-xl border border-border bg-card/60 p-4">
    //     <div className="flex gap-2">
    //       <input
    //         value={email}
    //         onChange={(e) => setEmail(e.target.value)}
    //         placeholder="member@company.com"
    //         className="h-10 flex-1 rounded-md border border-border bg-input px-3 text-sm"
    //       />
    //       <button
    //         type="button"
    //         disabled={busy}
    //         onClick={() => void onAdd()}
    //         className="rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
    //       >
    //         Add member
    //       </button>
    //     </div>
    //   </div>
    //   <div className="rounded-xl border border-border bg-card/60">
    //     {(teamQuery.data.members || []).map((m) => (
    //       <div key={m.id} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
    //         <div>
    //           <div className="text-sm font-medium">{m.email}</div>
    //           <div className="text-xs text-muted-foreground">
    //             {m.role} · {m.must_change_password ? "must change password" : "ready"}
    //           </div>
    //         </div>
    //         <button
    //           type="button"
    //           onClick={() => void onRemove(m.id)}
    //           className="rounded-md border border-border px-3 py-1.5 text-xs"
    //         >
    //           Remove
    //         </button>
    //       </div>
    //     ))}
    //   </div>
    // </div>
  );
}
