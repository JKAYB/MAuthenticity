import { createFileRoute, isRedirect, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { prefetchMe } from "@/features/auth/hooks";
import { changePassword } from "@/lib/api";
import { getRouterQueryClient } from "@/lib/queryClient";
import { meQueryKey } from "@/features/auth/queryKeys";
import { hasCompletedOnboarding } from "@/features/auth/onboarding";

export const Route = createFileRoute("/change-password")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    try {
      const me = await prefetchMe();
      if (!me.must_change_password) {
        const target = hasCompletedOnboarding(me) ? "/dashboard" : "/plans";
        console.info("[auth] redirect target", target);
        throw redirect({ to: target as "/dashboard" | "/plans" });
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
      console.info("[auth] redirect target", "/login");
      throw redirect({ to: "/login" });
    }
  },
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await changePassword({ currentPassword, newPassword, confirmPassword: newPassword });
      await getRouterQueryClient().invalidateQueries({ queryKey: meQueryKey });
      const me = await prefetchMe();
      const target = hasCompletedOnboarding(me) ? "/dashboard" : "/plans";
      toast.success("Password changed");
      navigate({ to: target });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Password change failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">Set a new password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You were invited with a temporary password. Please set a new one to continue.
      </p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Temporary password"
          className="h-11 w-full rounded-lg border border-border bg-input px-3 text-sm"
        />
        <input
          type="password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          className="h-11 w-full rounded-lg border border-border bg-input px-3 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Saving..." : "Save password"}
        </button>
      </form>
    </div>
  );
}
