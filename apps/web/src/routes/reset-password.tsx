import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { confirmPasswordReset, requestPasswordReset } from "@/lib/api";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: () => ({
    meta: [{ title: "Reset password — MAuthenticity" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await requestPasswordReset(email);
      toast.success(result.message);
      setDone(true);
      setEmail("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not request password reset");
    } finally {
      setBusy(false);
    }
  };

  const onConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset({
        token: token || "",
        newPassword,
        confirmPassword,
      });
      toast.success("Password reset successful. Please sign in.");
      setDone(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">{token ? "Set new password" : "Reset password"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {token
          ? "Choose a new password for your account."
          : "Enter your email and we will send reset instructions if an account exists."}
      </p>

      {done ? (
        <div className="mt-6 rounded-lg border border-border bg-card/60 p-4 text-sm">
          <p className="text-muted-foreground">
            {token
              ? "Your password has been reset."
              : "If an account exists, reset instructions have been sent."}
          </p>
          <Link to="/login" className="mt-3 inline-block font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : token ? (
        <form className="mt-6 space-y-4" onSubmit={onConfirmReset}>
          <input
            type="password"
            required
            minLength={8}
            maxLength={200}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            className="h-11 w-full rounded-lg border border-border bg-input px-3 text-sm"
            autoComplete="new-password"
          />
          <input
            type="password"
            required
            minLength={8}
            maxLength={200}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className="h-11 w-full rounded-lg border border-border bg-input px-3 text-sm"
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Resetting..." : "Reset password"}
          </button>
        </form>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={onRequestReset}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="h-11 w-full rounded-lg border border-border bg-input px-3 text-sm"
            autoComplete="email"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Sending..." : "Send reset instructions"}
          </button>
        </form>
      )}
    </div>
  );
}
